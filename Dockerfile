FROM node:20-bullseye

# Install required system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    bash \
    gnupg \
    wget \
    lsb-release \
    ca-certificates \
    build-essential \
    zlib1g-dev \
    libffi-dev \
    libssl-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    openjdk-11-jdk \
    && rm -rf /var/lib/apt/lists/*

# Install Python 3.10 from source (safe and guaranteed for Debian)
RUN cd /usr/src && \
    wget https://www.python.org/ftp/python/3.10.14/Python-3.10.14.tgz && \
    tar xzf Python-3.10.14.tgz && \
    cd Python-3.10.14 && \
    ./configure --enable-optimizations && \
    make -j$(nproc) && \
    make altinstall && \
    ln -sf /usr/local/bin/python3.10 /usr/bin/python3 && \
    ln -sf /usr/local/bin/python3.10 /usr/bin/python && \
    ln -sf /usr/local/bin/pip3.10 /usr/bin/pip3 && \
    python3 --version && python --version && pip3 --version && \
    cd .. && rm -rf Python-3.10.14 Python-3.10.14.tgz

# Set JAVA environment
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"
ENV JAVA_TOOL_OPTIONS="-Xmx2048m"

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

# Copy application files
COPY . .

# Create required directories
RUN mkdir -p /usr/src/app/projects /usr/src/app/temp /usr/src/app/reports

# Expose the app port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]