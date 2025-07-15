# Use Node.js 20 base image (required for code-analyzer v5+)
FROM node:20-bullseye

# Install required system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    bash \
    openjdk-11-jre-headless \
    python3 \
    python3-venv \
    python3-dev \
    python3-pip \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && ln -sf /usr/bin/pip3 /usr/bin/pip \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Install Salesforce CLI
RUN npm install --global @salesforce/cli

# Install Salesforce Code Analyzer v5.2.2
RUN sf plugins install code-analyzer@5.2.2

# Set working directory
WORKDIR /usr/src/app

# Copy dependency files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy source code
COPY . .

# Create required directories
RUN mkdir -p /usr/src/app/projects /usr/src/app/temp /usr/src/app/reports

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]