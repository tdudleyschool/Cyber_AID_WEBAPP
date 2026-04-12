FROM ubuntu:24.04

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       g++ \
       libcurl4-openssl-dev \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY main.cpp .

RUN g++ -std=c++17 main.cpp -o load_balancer -lcurl -pthread

EXPOSE 9000

CMD ["./load_balancer"]
