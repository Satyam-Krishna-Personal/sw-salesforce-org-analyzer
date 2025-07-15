# Use Node.js with Debian base for better compatibility
FROM node:18-bullseye

# Set environment variables
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV NODE_ENV=production

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    bash \
    openjdk-11-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Install Salesforce CLI globally
RUN npm install -g @salesforce/cli

# Install Salesforce Code Analyzer plugin v5.2.2
RUN sf plugins install code-analyzer@5.2.2

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Create required directories
RUN mkdir -p /usr/src/app/projects /usr/src/app/temp /usr/src/app/reports

# Expose the application port
EXPOSE 3000

# Start the Node.js app
CMD ["npm", "start"]