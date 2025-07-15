# Use Node.js 20 base image (required for Code Analyzer v5+)
FROM node:20-bullseye

# Install system dependencies & Python 3.10+
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    unzip \
    bash \
    gnupg \
    software-properties-common \
    openjdk-11-jre-headless \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3.10-venv \
    python3.10-dev \
    python3-pip \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && python3 --version && python --version && pip3 --version \
    && rm -rf /var/lib/apt/lists/* \
    && npm cache clean --force \
    && rm -rf /root/.npm /root/.cache

# Set Java home
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Install Salesforce CLI
RUN npm install --global @salesforce/cli

# Install Salesforce Code Analyzer v5.2.2
RUN sf plugins install code-analyzer@5.2.2

# App work directory
WORKDIR /usr/src/app

# Copy and install app dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create required dirs
RUN mkdir -p /usr/src/app/projects /usr/src/app/temp /usr/src/app/reports

# Expose app port
EXPOSE 3000

# Start app
CMD ["npm", "start"]