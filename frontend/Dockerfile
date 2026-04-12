FROM nginx:alpine

WORKDIR /usr/share/nginx/html

COPY index.html script.js styles.css ./

EXPOSE 80

CMD ["sh", "-c", "printf '%s\\n' \"window.LB_URL = \\\"${LB_URL:-}\\\";\" \"window.SERVICE_CNN_1 = \\\"${SERVICE_CNN_1:-}\\\";\" \"window.SERVICE_CNN_2 = \\\"${SERVICE_CNN_2:-}\\\";\" \"window.SERVICE_CNN_3 = \\\"${SERVICE_CNN_3:-}\\\";\" \"window.SERVICE_LR_1 = \\\"${SERVICE_LR_1:-}\\\";\" \"window.SERVICE_LR_2 = \\\"${SERVICE_LR_2:-}\\\";\" \"window.SERVICE_LR_3 = \\\"${SERVICE_LR_3:-}\\\";\" > /usr/share/nginx/html/env-config.js && exec nginx -g 'daemon off;'" ]
