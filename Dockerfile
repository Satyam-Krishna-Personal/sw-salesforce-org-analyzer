FROM node:20-bullseye

# Install base tools and openjdk
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    bash \
    gnupg \
    ca-certificates \
    lsb-release \
    openjdk-11-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Add deadsnakes repo for Python 3.10
RUN curl -fsSL https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x6A755776 \
    | gpg --dearmor -o /usr/share/keyrings/deadsnakes.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/deadsnakes.gpg] http://ppa.launchpad.net/deadsnakes/ppa/ubuntu focal main" \
    > /etc/apt/sources.list.d/deadsnakes.list && \
    apt-get update && \
    apt-get install -y python3.10 python3.10-venv python3.10-dev python3-pip && \
    ln -sf /usr/bin/python3.10 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.10 /usr/bin/python

# Show versions
RUN python3 --version && python --version && pip3 --version

# Set JAVA_HOME
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Install Salesforce CLI
RUN npm install -g @salesforce/cli

# Install Salesforce Code Analyzer
RUN sf plugins install code-analyzer@5.2.2

# Setup workdir and app
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .

# Create folders
RUN mkdir -p /usr/src/app/projects /usr/src/app/temp /usr/src/app/reports

EXPOSE 3000
CMD ["npm", "start"]