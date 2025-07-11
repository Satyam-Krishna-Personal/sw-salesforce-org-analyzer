# Use Node.js base image
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    openjdk-11-jdk \
    && rm -rf /var/lib/apt/lists/*

# Set JAVA_HOME
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64

# Install Salesforce CLI
RUN npm install -g @salesforce/cli

# Install Salesforce Code Analyzer
RUN sf plugins install @salesforce/sfdx-scanner

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Create necessary directories
RUN mkdir -p /usr/src/app/projects
RUN mkdir -p /usr/src/app/temp
RUN mkdir -p /usr/src/app/reports

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]