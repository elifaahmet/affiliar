# Use the official Node.js runtime as the base image
FROM 10.20.0.11:18080/node:18 AS build

# Set the working directory in the container
WORKDIR /app

#Config proxy
RUN npm config set registry http://10.20.0.11:8081/repository/npm-proxy
RUN echo '//registry.npmjs.org/:_auth="YWRtaW46UzNjdXJlUGFzc3dvcmQ="' > ~/.npmrc

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the entire application code to the container
COPY . .

# Build the React app for production
RUN npm run build

# Use Nginx as the production server
FROM 10.20.0.11:18080/nginx:alpine

#SPA config
RUN sed -i '11i try_files $uri /index.html;' /etc/nginx/conf.d/default.conf


# Copy the built React app to Nginx's web server directory
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80 for the Nginx server
EXPOSE 80

# Start Nginx when the container runs
CMD ["nginx", "-g", "daemon off;"]
