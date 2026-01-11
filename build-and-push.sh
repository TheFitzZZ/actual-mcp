#!/bin/bash

# Configuration
REGISTRY="192.168.0.4:5001"
PROJECT_NAME="actual-mcp"
VERSION="${1:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to show insecure registry setup instructions
show_insecure_registry_help() {
    echo -e "${RED}================================${NC}"
    echo -e "${RED}Push Failed - Insecure Registry${NC}"
    echo -e "${RED}================================${NC}"
    echo ""
    echo -e "${YELLOW}Your registry is running on HTTP, but Docker requires HTTPS by default.${NC}"
    echo -e "${YELLOW}To fix this, configure Docker to allow insecure registry access:${NC}"
    echo ""
    echo "1. Create or edit /etc/docker/daemon.json:"
    echo "   sudo nano /etc/docker/daemon.json"
    echo ""
    echo "2. Add the following content:"
    echo '   {'
    echo "     \"insecure-registries\": [\"${REGISTRY}\"]"
    echo '   }'
    echo ""
    echo "3. Restart Docker:"
    echo "   sudo systemctl restart docker"
    echo ""
    echo "4. Run this script again"
    echo ""
}

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Actual MCP Build & Push${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check if registry is configured as insecure
echo -e "${YELLOW}Checking Docker daemon configuration...${NC}"
if [ -f /etc/docker/daemon.json ]; then
    if ! grep -q "${REGISTRY}" /etc/docker/daemon.json; then
        echo -e "${RED}Warning: Registry ${REGISTRY} not configured as insecure in /etc/docker/daemon.json${NC}"
        echo -e "${YELLOW}You may need to add it. See instructions at the end if push fails.${NC}"
    else
        echo -e "${GREEN}✓ Registry is configured as insecure${NC}"
    fi
else
    echo -e "${YELLOW}Warning: /etc/docker/daemon.json not found${NC}"
    echo -e "${YELLOW}You may need to configure the insecure registry. See instructions at the end if push fails.${NC}"
fi
echo ""

# Check if registry is reachable
echo -e "${YELLOW}Checking registry connectivity...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "http://${REGISTRY}/v2/" | grep -q "200\|401"; then
    echo -e "${GREEN}✓ Registry is reachable${NC}"
else
    echo -e "${RED}Warning: Cannot reach registry at ${REGISTRY}${NC}"
    echo -e "${YELLOW}Continuing anyway...${NC}"
fi
echo ""

# Build and push image
echo -e "${GREEN}Building image...${NC}"
DOCKER_BUILDKIT=0 sudo -E docker build -t ${REGISTRY}/${PROJECT_NAME}:${VERSION} .
if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Pushing image to registry...${NC}"
if ! sudo docker push ${REGISTRY}/${PROJECT_NAME}:${VERSION}; then
    echo -e "${RED}Push failed!${NC}"
    if sudo docker push ${REGISTRY}/${PROJECT_NAME}:${VERSION} 2>&1 | grep -q "server gave HTTP response to HTTPS client"; then
        show_insecure_registry_help
    fi
    exit 1
fi
echo -e "${GREEN}✓ Image pushed successfully${NC}"
echo ""

# Summary
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Build and Push Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Image pushed:"
echo "  - ${REGISTRY}/${PROJECT_NAME}:${VERSION}"
echo ""
echo "To pull and run this image on another machine:"
echo "  sudo docker pull ${REGISTRY}/${PROJECT_NAME}:${VERSION}"
echo ""
