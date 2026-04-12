FROM nginx:alpine

WORKDIR /usr/share/nginx/html

COPY index.html script.js styles.css ./

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
