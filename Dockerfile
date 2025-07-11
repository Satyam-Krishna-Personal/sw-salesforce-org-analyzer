# Use more robust base image
FROM node:18-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    openjdk-11-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Set JAVA_HOME (adjusted for JRE path)
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64

# Install Salesforce CLI
RUN npm install @salesforce/cli --global

# Install Salesforce Code Analyzer
RUN sf plugins install code-analyzer@latest

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy rest of app
COPY . .

# Create directories
RUN mkdir -p /usr/src/app/projects /usr/src/app/temp /usr/src/app/reports

# Expose application port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]