FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Expose port (Smithery will set PORT env var)
EXPOSE 8000

# Start the server
CMD ["node", "dist/index.js"]
