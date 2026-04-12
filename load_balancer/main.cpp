#include <arpa/inet.h>
#include <curl/curl.h>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

#include <atomic>
#include <cerrno>
#include <climits>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

struct Backend {
  std::string url;
  std::atomic<int> active_requests{0};

  Backend() = default;
  Backend(const std::string& u) : url(u), active_requests(0) {}
  Backend(const Backend&) = delete;
  Backend& operator=(const Backend&) = delete;
  Backend(Backend&& other) noexcept : url(std::move(other.url)), active_requests(other.active_requests.load()) {}
  Backend& operator=(Backend&& other) noexcept {
    if (this != &other) {
      url = std::move(other.url);
      active_requests.store(other.active_requests.load());
    }
    return *this;
  }
};

static std::vector<Backend> cnn_backends;
static std::vector<Backend> lr_backends;
static std::mutex rr_mutex;
static size_t cnn_rr_index = 0;
static size_t lr_rr_index = 0;

static std::string to_lower(const std::string& value) {
  std::string result;
  result.reserve(value.size());
  for (char c : value) {
    result.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
  }
  return result;
}

static size_t curlWriteCallback(void* contents, size_t size, size_t nmemb, void* userdata) {
  size_t total = size * nmemb;
  auto* buffer = static_cast<std::string*>(userdata);
  buffer->append(static_cast<char*>(contents), total);
  return total;
}

static size_t curlHeaderCallback(char* buffer, size_t size, size_t nitems, void* userdata) {
  size_t total = size * nitems;
  std::string header(buffer, total);
  auto* content_type = static_cast<std::string*>(userdata);

  std::string lower_header = to_lower(header);

    if (lower_header.rfind("content-type:", 0) == 0) {
    auto colon = header.find(':');
    if (colon != std::string::npos) {

        std::string value = header.substr(colon + 1);

        // trim CRLF + spaces (right side)
        while (!value.empty() &&
            (value.back() == '\r' || value.back() == '\n' || value.back() == ' ')) {
        value.pop_back();
        }

        // trim left side spaces
        size_t start = 0;
        while (start < value.size() &&
            std::isspace(static_cast<unsigned char>(value[start]))) {
        start++;
        }

        // write result safely
        *static_cast<std::string*>(userdata) = value.substr(start);
    }
    }

  return total;
}

static bool send_all(int client_fd, const std::string& data) {
  size_t total_sent = 0;
  while (total_sent < data.size()) {
    ssize_t sent = send(client_fd, data.data() + total_sent, data.size() - total_sent, 0);
    if (sent <= 0) {
      return false;
    }
    total_sent += static_cast<size_t>(sent);
  }
  return true;
}

static std::string trim(const std::string& value) {
  size_t start = 0;
  while (start < value.size() && std::isspace(static_cast<unsigned char>(value[start]))) {
    start++;
  }
  size_t end = value.size();
  while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    end--;
  }
  return value.substr(start, end - start);
}

static std::map<std::string, std::string> parse_query_string(const std::string& query) {
  std::map<std::string, std::string> params;
  size_t start = 0;
  while (start < query.size()) {
    size_t equal_pos = query.find('=', start);
    size_t amp_pos = query.find('&', start);
    if (equal_pos == std::string::npos) {
      break;
    }
    std::string key = query.substr(start, equal_pos - start);
    std::string value = (amp_pos == std::string::npos)
      ? query.substr(equal_pos + 1)
      : query.substr(equal_pos + 1, amp_pos - equal_pos - 1);
    params[to_lower(key)] = value;
    if (amp_pos == std::string::npos) {
      break;
    }
    start = amp_pos + 1;
  }
  return params;
}

static std::string build_query_string(const std::map<std::string, std::string>& params,
                                      const std::string& skip_key) {
  std::string result;
  bool first = true;
  for (const auto& [key, value] : params) {
    if (to_lower(key) == to_lower(skip_key)) {
      continue;
    }
    if (!first) {
      result.push_back('&');
    }
    result += key;
    result.push_back('=');
    result += value;
    first = false;
  }
  return result;
}

static std::string normalize_model(const std::string& raw) {
  std::string lower = to_lower(raw);
  if (lower == "cnn") {
    return "cnn";
  }
  if (lower == "lr" || lower == "logreg" || lower == "logistic") {
    return "logreg";
  }
  return "";
}

static std::vector<std::string> read_backend_list(const std::string& env_name,
                                                  const std::vector<std::string>& defaults) {
  const char* env = std::getenv(env_name.c_str());
  if (env && env[0] != '\0') {
    std::vector<std::string> values;
    std::string str(env);
    size_t start = 0;
    while (start < str.size()) {
      size_t comma = str.find(',', start);
      std::string item = trim(str.substr(start, comma == std::string::npos ? str.size() - start : comma - start));
      if (!item.empty()) {
        values.push_back(item);
      }
      if (comma == std::string::npos) {
        break;
      }
      start = comma + 1;
    }
    if (!values.empty()) {
      return values;
    }
  }
  return defaults;
}

static int read_http_request(int client_fd, std::string& request_text, std::map<std::string, std::string>& headers,
                             std::string& method, std::string& target, std::string& http_version, std::string& body) {
  const size_t max_header_size = 32 * 1024;
  request_text.clear();
  body.clear();

  while (true) {
    char buffer[4096];
    ssize_t received = recv(client_fd, buffer, sizeof(buffer), 0);
    if (received < 0) {
      if (errno == EINTR) {
        continue;
      }
      return -1;
    }
    if (received == 0) {
      return -1;
    }
    request_text.append(buffer, static_cast<size_t>(received));
    size_t header_end = request_text.find("\r\n\r\n");
    if (header_end == std::string::npos) {
      if (request_text.size() > max_header_size) {
        return -1;
      }
      continue;
    }

    std::string header_section = request_text.substr(0, header_end);
    std::istringstream stream(header_section);
    std::string request_line;
    if (!std::getline(stream, request_line) || request_line.empty()) {
      return -1;
    }
    if (request_line.back() == '\r') {
      request_line.pop_back();
    }
    std::istringstream request_line_stream(request_line);
    request_line_stream >> method >> target >> http_version;
    std::string line;
    while (std::getline(stream, line)) {
      if (!line.empty() && line.back() == '\r') {
        line.pop_back();
      }
      if (line.empty()) {
        break;
      }
      size_t colon = line.find(':');
      if (colon == std::string::npos) {
        continue;
      }
      std::string key = to_lower(trim(line.substr(0, colon)));
      std::string value = trim(line.substr(colon + 1));
      headers[key] = value;
    }

    size_t content_length = 0;
    if (headers.count("content-length")) {
      try {
        content_length = static_cast<size_t>(std::stoul(headers["content-length"]));
      } catch (...) {
        return -1;
      }
    }
    size_t total_length = header_end + 4 + content_length;
    while (request_text.size() < total_length) {
      ssize_t more = recv(client_fd, buffer, sizeof(buffer), 0);
      if (more <= 0) {
        return -1;
      }
      request_text.append(buffer, static_cast<size_t>(more));
    }
    body = request_text.substr(header_end + 4, content_length);
    return 0;
  }
}

static int select_backend_index(const std::vector<Backend>& backends, size_t& rr_index) {
  int min_load = INT_MAX;
  std::vector<int> candidates;
  for (int i = 0; i < static_cast<int>(backends.size()); ++i) {
    int load = backends[i].active_requests.load();
    if (load < min_load) {
      min_load = load;
      candidates.clear();
      candidates.push_back(i);
    } else if (load == min_load) {
      candidates.push_back(i);
    }
  }
  if (candidates.empty()) {
    return 0;
  }
  int choice = candidates[rr_index % candidates.size()];
  rr_index = (rr_index + 1) % candidates.size();
  return choice;
}

static bool proxy_to_backend(const std::string& backend_base,
                             const std::string& path,
                             const std::string& query_string,
                             const std::string& method,
                             const std::map<std::string, std::string>& headers,
                             const std::string& body,
                             std::string& response_body,
                             int& response_code,
                             std::string& response_content_type) {
  CURL* curl = curl_easy_init();
  if (!curl) {
    return false;
  }

  curl_easy_setopt(curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
  curl_easy_setopt(curl, CURLOPT_FORBID_REUSE, 1L);
  curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);

  std::string url = backend_base + path;
  if (!query_string.empty()) {
    url += "?" + query_string;
  }

  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curlWriteCallback);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_body);
  curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, curlHeaderCallback);
  curl_easy_setopt(curl, CURLOPT_HEADERDATA, &response_content_type);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);

  struct curl_slist* header_list = nullptr;

  bool has_content_type = false;

  for (const auto& [key, value] : headers) {
    if (key == "host" || key == "content-length" || key == "connection") {
        continue;
  }

  if (key == "content-type") {
        has_content_type = true;
  }

  std::string h = key + ": " + value;
    header_list = curl_slist_append(header_list, h.c_str());
  }

    // IMPORTANT: preserve multipart upload type if missing
  if (!has_content_type && method == "POST") {
    header_list = curl_slist_append(header_list, "Content-Type: multipart/form-data");
  }

  if (!header_list) {
    header_list = curl_slist_append(header_list, "Connection: close");
  }

  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, header_list);

  if (method == "POST") {
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.data());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, body.size());
  } else if (method == "GET") {
    curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
  } else {
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method.c_str());
    if (!body.empty()) {
      curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.data());
      curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE_LARGE, static_cast<curl_off_t>(body.size()));
    }
  }

  CURLcode res = curl_easy_perform(curl);
  if (res != CURLE_OK) {
    curl_slist_free_all(header_list);
    curl_easy_cleanup(curl);
    return false;
  }

  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response_code);
  curl_slist_free_all(header_list);
  curl_easy_cleanup(curl);
  return true;
}

static bool build_http_response(int client_fd, int status_code, const std::string& body,
                                const std::string& content_type, const std::string& request_id) {
  std::ostringstream response;
  response << "HTTP/1.1 " << status_code << " ";
  if (status_code == 200) {
    response << "OK";
  } else if (status_code == 400) {
    response << "Bad Request";
  } else if (status_code == 404) {
    response << "Not Found";
  } else if (status_code == 405) {
    response << "Method Not Allowed";
  } else if (status_code == 502) {
    response << "Bad Gateway";
  } else {
    response << "Internal Server Error";
  }
  response << "\r\n";
  response << "Content-Type: " << (content_type.empty() ? "application/json" : content_type) << "\r\n";
  response << "Content-Length: " << body.size() << "\r\n";
  response << "Connection: close\r\n";
  response << "Access-Control-Allow-Origin: *\r\n";
  response << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
  response << "Access-Control-Allow-Headers: X-Request-ID, X-Forwarded-By, Content-Type\r\n";
  response << "Access-Control-Expose-Headers: X-Request-ID\r\n";
  if (!request_id.empty()) {
    response << "X-Request-ID: " << request_id << "\r\n";
  }
  response << "\r\n";
  response << body;
  return send_all(client_fd, response.str());
}

static void handle_client(int client_fd) {
  std::string request_text;
  std::map<std::string, std::string> headers;
  std::string method;
  std::string target;
  std::string http_version;
  std::string body;
  if (read_http_request(client_fd, request_text, headers, method, target, http_version, body) < 0) {
    close(client_fd);
    return;
  }

  std::string request_id;
  if (headers.count("x-request-id")) {
    request_id = headers["x-request-id"];
  }

  std::string path;
  std::string query_string;
  size_t question = target.find('?');
  if (question == std::string::npos) {
    path = target;
    query_string.clear();
  } else {
    path = target.substr(0, question);
    query_string = target.substr(question + 1);
  }

  auto query_params = parse_query_string(query_string);
  std::string model = normalize_model(query_params.count("model") ? query_params["model"] : "");
  if (model.empty() && headers.count("x-model")) {
    model = normalize_model(headers["x-model"]);
  }

  if (method == "OPTIONS") {
    const std::string empty_body = "";
    build_http_response(client_fd, 200, empty_body, "application/json", request_id);
    close(client_fd);
    return;
  }

  if (method == "GET" && path == "/health") {
    std::ostringstream body_stream;
    body_stream << "{\"status\":\"ok\",\"queues\":{\"cnn\":[";
    for (size_t i = 0; i < cnn_backends.size(); ++i) {
      if (i) body_stream << ",";
      body_stream << cnn_backends[i].active_requests.load();
    }
    body_stream << "],\"logreg\":[";
    for (size_t i = 0; i < lr_backends.size(); ++i) {
      if (i) body_stream << ",";
      body_stream << lr_backends[i].active_requests.load();
    }
    body_stream << "]}}";
    build_http_response(client_fd, 200, body_stream.str(), "application/json", request_id);
    close(client_fd);
    return;
  }

  if (method != "POST" || (path != "/predict" && path != "/predict_threshold")) {
    const std::string error_body = "{\"detail\":\"Unsupported endpoint or method.\"}";
    build_http_response(client_fd, 404, error_body, "application/json", request_id);
    close(client_fd);
    return;
  }

  if (model.empty()) {
    const std::string error_body = "{\"detail\":\"Missing or invalid model parameter. Use model=cnn or model=logreg.\"}";
    build_http_response(client_fd, 400, error_body, "application/json", request_id);
    close(client_fd);
    return;
  }

  std::vector<Backend>* backend_list = nullptr;
  size_t* rr_index = nullptr;
  if (model == "cnn") {
    backend_list = &cnn_backends;
    rr_index = &cnn_rr_index;
  } else {
    backend_list = &lr_backends;
    rr_index = &lr_rr_index;
  }

  int backend_idx;
  {
    std::lock_guard<std::mutex> lock(rr_mutex);
    backend_idx = select_backend_index(*backend_list, *rr_index);
  }

  Backend& backend = (*backend_list)[backend_idx];
  backend.active_requests.fetch_add(1, std::memory_order_relaxed);

  std::map<std::string, std::string> forward_headers = headers;
  forward_headers["x-forwarded-by"] = "cpp-load-balancer";
  if (!request_id.empty()) {
    forward_headers["x-request-id"] = request_id;
  }
  std::string forward_query = build_query_string(query_params, "model");
  std::string response_body;
  int response_code = 0;
  std::string response_content_type;
  bool success = proxy_to_backend(backend.url, path, forward_query, method, forward_headers, body,
                                  response_body, response_code, response_content_type);

  backend.active_requests.fetch_sub(1, std::memory_order_relaxed);

  if (!success) {
    const std::string error_body = "{\"detail\":\"Unable to reach backend service.\"}";
    build_http_response(client_fd, 502, error_body, "application/json", request_id);
    close(client_fd);
    return;
  }

  if (response_content_type.empty()) {
    response_content_type = "application/json";
  }
  build_http_response(client_fd, response_code, response_body, response_content_type, request_id);
  close(client_fd);
}

int main() {
  signal(SIGPIPE, SIG_IGN);
  const char* port_env = std::getenv("LB_PORT");
  if (!port_env || port_env[0] == '\0') {
    port_env = std::getenv("PORT");
  }
  int port = 9000;
  if (port_env) {
    try {
      port = std::stoi(port_env);
    } catch (...) {
      port = 9000;
    }
  }

  auto ensure_scheme = [](const std::string& url) {
    std::string lower = to_lower(url);
    if (lower.rfind("http://", 0) == 0 || lower.rfind("https://", 0) == 0) {
      return url;
    }
    return std::string("https://") + url;
  };

  auto add_url_if_valid = [&](std::vector<std::string>& list, const char* env_name) {
    const char* env_value = std::getenv(env_name);
    if (env_value && env_value[0] != '\0') {
      std::string url = trim(std::string(env_value));
      if (!url.empty()) {
        list.push_back(ensure_scheme(url));
      }
    }
  };

  std::vector<std::string> cnn_urls = read_backend_list("LB_CNN_URLS", {});
  std::vector<std::string> lr_urls = read_backend_list("LB_LR_URLS", {});

  if (cnn_urls.empty()) {
    add_url_if_valid(cnn_urls, "SERVICE_CNN_1");
    add_url_if_valid(cnn_urls, "SERVICE_CNN_2");
    add_url_if_valid(cnn_urls, "SERVICE_CNN_3");
  }

  if (lr_urls.empty()) {
    add_url_if_valid(lr_urls, "SERVICE_LR_1");
    add_url_if_valid(lr_urls, "SERVICE_LR_2");
    add_url_if_valid(lr_urls, "SERVICE_LR_3");
  }

  if (cnn_urls.empty()) {
    cnn_urls = {"http://127.0.0.1:8000", "http://127.0.0.1:8002", "http://127.0.0.1:8004"};
  }
  if (lr_urls.empty()) {
    lr_urls = {"http://127.0.0.1:8001", "http://127.0.0.1:8003", "http://127.0.0.1:8005"};
  }

  for (const auto& url : cnn_urls) {
    cnn_backends.emplace_back(url);
  }
  for (const auto& url : lr_urls) {
    lr_backends.emplace_back(url);
  }

  curl_global_init(CURL_GLOBAL_DEFAULT);

  int server_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server_fd < 0) {
    std::cerr << "Unable to create socket: " << strerror(errno) << "\n";
    return 1;
  }

  int yes = 1;
  setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

  sockaddr_in server_addr;
  std::memset(&server_addr, 0, sizeof(server_addr));
  server_addr.sin_family = AF_INET;
  server_addr.sin_addr.s_addr = INADDR_ANY;
  server_addr.sin_port = htons(static_cast<uint16_t>(port));

  if (bind(server_fd, reinterpret_cast<sockaddr*>(&server_addr), sizeof(server_addr)) < 0) {
    std::cerr << "Unable to bind socket: " << strerror(errno) << "\n";
    close(server_fd);
    return 1;
  }

  if (listen(server_fd, 16) < 0) {
    std::cerr << "Unable to listen on socket: " << strerror(errno) << "\n";
    close(server_fd);
    return 1;
  }

  std::cout << "Load balancer listening on port " << port << "\n";
  std::cout << "CNN backends: ";
  for (const auto& backend : cnn_backends) {
    std::cout << backend.url << " ";
  }
  std::cout << "\n";
  std::cout << "LR backends: ";
  for (const auto& backend : lr_backends) {
    std::cout << backend.url << " ";
  }
  std::cout << "\n";

  while (true) {
    sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);
    int client_fd = accept(server_fd, reinterpret_cast<sockaddr*>(&client_addr), &client_len);
    if (client_fd < 0) {
      if (errno == EINTR) {
        continue;
      }
      std::cerr << "Accept failed: " << strerror(errno) << "\n";
      break;
    }

    std::thread(handle_client, client_fd).detach();
  }

  close(server_fd);
  curl_global_cleanup();
  return 0;
}
