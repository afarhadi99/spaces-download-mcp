import express, { Request, Response } from 'express';

// Types for API responses
interface DownloadResponse {
  download_id: string;
  status: string;
  message: string;
}

interface StatusResponse {
  download_id: string;
  status: string;
  message: string;
  space_url: string;
  space_id?: string;
  r2_url?: string;
  error?: string;
  filename?: string;
}

interface TranscribeResponse {
  transcription_id: string;
  space_id: string;
  status: string;
  message: string;
}

interface TranscriptionStatusResponse {
  transcription_id: string;
  space_id: string;
  status: string;
  message: string;
  error?: string;
}

interface SpaceInfo {
  id: string;
  title: string;
  creator_name: string;
  creator_screen_name: string;
  start_date: string;
  has_audio: boolean;
  has_transcript: boolean;
  audio_size?: number;
  state?: string;
}

interface SpaceAvailabilityResponse {
  available: boolean;
  status?: string;
  error?: string;
  space_info?: any;
}

// Configuration interface
interface Config {
  apiUrl: string;
  timeout?: number;
}

// JSON-RPC request/response interfaces
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// MCP Server capabilities
const SERVER_CAPABILITIES = {
  tools: {},
};

// Server info
const SERVER_INFO = {
  name: 'twitter-spaces',
  version: '1.0.0',
};

// Utility function to make API requests
async function makeApiRequest(
  url: string, 
  config: Config,
  options: RequestInit = {}
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (config.timeout || 30) * 1000);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      throw new Error(`API request failed: ${error.message}`);
    }
    throw error;
  }
}

// Utility function to poll for completion
async function pollForCompletion(
  statusUrl: string,
  config: Config,
  completedStatuses: string[] = ['completed'],
  failedStatuses: string[] = ['failed'],
  maxAttempts: number = 60,
  intervalMs: number = 5000
): Promise<any> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await makeApiRequest(statusUrl, config);
    
    if (completedStatuses.includes(status.status)) {
      return status;
    }
    
    if (failedStatuses.includes(status.status)) {
      throw new Error(`Operation failed: ${status.error || status.message}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Operation timed out after ${maxAttempts} attempts`);
}

// Parse configuration from query parameters
function parseConfig(query: any): Config {
  return {
    apiUrl: query.apiUrl || 'http://localhost:8000',
    timeout: query.timeout ? parseInt(query.timeout) : 30,
  };
}

// Tool definitions (lazy loading - no config required)
const TOOLS = [
  {
    name: 'check_space_availability',
    description: 'Check if a Twitter Space is available for download',
    inputSchema: {
      type: 'object',
      properties: {
        space_url: {
          type: 'string',
          description: 'Full Twitter Space URL (e.g., https://x.com/i/spaces/1ZkKzYLnWOLxv)',
        },
      },
      required: ['space_url'],
    },
  },
  {
    name: 'download_twitter_space',
    description: 'Download a Twitter Space and wait for completion',
    inputSchema: {
      type: 'object',
      properties: {
        space_url: {
          type: 'string',
          description: 'Full Twitter Space URL (e.g., https://x.com/i/spaces/1ZkKzYLnWOLxv)',
        },
        wait_for_completion: {
          type: 'boolean',
          description: 'Whether to wait for download completion before returning',
          default: true,
        },
      },
      required: ['space_url'],
    },
  },
  {
    name: 'transcribe_space',
    description: 'Transcribe a downloaded Twitter Space using AI',
    inputSchema: {
      type: 'object',
      properties: {
        space_id: {
          type: 'string',
          description: 'Space ID (e.g., 1ZkKzYLnWOLxv)',
        },
        wait_for_completion: {
          type: 'boolean',
          description: 'Whether to wait for transcription completion before returning',
          default: true,
        },
      },
      required: ['space_id'],
    },
  },
  {
    name: 'get_transcript',
    description: 'Download transcript in various formats (json, txt, paragraphs, timecoded, summary)',
    inputSchema: {
      type: 'object',
      properties: {
        space_id: {
          type: 'string',
          description: 'Space ID (e.g., 1ZkKzYLnWOLxv)',
        },
        format: {
          type: 'string',
          enum: ['json', 'txt', 'paragraphs', 'timecoded', 'summary'],
          description: 'Transcript format to download',
          default: 'paragraphs',
        },
      },
      required: ['space_id'],
    },
  },
  {
    name: 'list_spaces',
    description: 'List all downloaded Twitter Spaces',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'download_and_transcribe_space',
    description: 'Download a Twitter Space and automatically transcribe it',
    inputSchema: {
      type: 'object',
      properties: {
        space_url: {
          type: 'string',
          description: 'Full Twitter Space URL (e.g., https://x.com/i/spaces/1ZkKzYLnWOLxv)',
        },
      },
      required: ['space_url'],
    },
  },
];

// Handle initialize method
async function handleInitialize(params: any): Promise<any> {
  return {
    protocolVersion: '2024-11-05',
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
}

// Handle tools/list method
async function handleListTools(): Promise<any> {
  return {
    tools: TOOLS
  };
}

// Handle tools/call method
async function handleCallTool(params: any, config: Config): Promise<any> {
  const { name, arguments: args } = params;

  try {
    switch (name) {
      case 'check_space_availability': {
        const { space_url } = args as { space_url: string };
        
        // Extract space ID from URL
        const spaceIdMatch = space_url.match(/\/spaces\/([a-zA-Z0-9]+)/);
        if (!spaceIdMatch) {
          throw new Error('Invalid space URL format');
        }
        
        const spaceId = spaceIdMatch[1];
        const url = `${config.apiUrl}/api/check-space/${spaceId}`;
        
        const result: SpaceAvailabilityResponse = await makeApiRequest(url, config);
        
        return {
          content: [{
            type: 'text',
            text: `Space Availability Check for ${space_url}:\n\n` +
                  `Available: ${result.available ? '✅ Yes' : '❌ No'}\n` +
                  `Status: ${result.status || 'Unknown'}\n` +
                  (result.error ? `Error: ${result.error}\n` : '') +
                  (result.space_info ? `Title: ${result.space_info.title || 'Unknown'}\n` : '') +
                  (result.space_info ? `Creator: ${result.space_info.creator_name || 'Unknown'}\n` : '') +
                  (result.space_info ? `State: ${result.space_info.state || 'Unknown'}\n` : '')
          }]
        };
      }

      case 'download_twitter_space': {
        const { space_url, wait_for_completion = true } = args as { space_url: string; wait_for_completion?: boolean };
        
        // Start download
        const downloadUrl = `${config.apiUrl}/api/download`;
        const downloadResponse: DownloadResponse = await makeApiRequest(downloadUrl, config, {
          method: 'POST',
          body: JSON.stringify({ space_url }),
        });
        
        let result = `Started download for ${space_url}\n`;
        result += `Download ID: ${downloadResponse.download_id}\n`;
        result += `Status: ${downloadResponse.status}\n`;
        result += `Message: ${downloadResponse.message}\n\n`;
        
        if (wait_for_completion) {
          result += 'Waiting for download to complete...\n\n';
          
          const statusUrl = `${config.apiUrl}/api/status/${downloadResponse.download_id}`;
          const finalStatus: StatusResponse = await pollForCompletion(statusUrl, config);
          
          result += `✅ Download completed!\n`;
          result += `Space ID: ${finalStatus.space_id}\n`;
          result += `Filename: ${finalStatus.filename}\n`;
          if (finalStatus.r2_url) {
            result += `R2 URL: ${finalStatus.r2_url}\n`;
          }
          result += `Final Message: ${finalStatus.message}\n`;
        }
        
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }

      case 'transcribe_space': {
        const { space_id, wait_for_completion = true } = args as { space_id: string; wait_for_completion?: boolean };
        
        // Start transcription
        const transcribeUrl = `${config.apiUrl}/api/transcribe`;
        const transcribeResponse: TranscribeResponse = await makeApiRequest(transcribeUrl, config, {
          method: 'POST',
          body: JSON.stringify({ space_id }),
        });
        
        let result = `Started transcription for space ${space_id}\n`;
        result += `Transcription ID: ${transcribeResponse.transcription_id}\n`;
        result += `Status: ${transcribeResponse.status}\n`;
        result += `Message: ${transcribeResponse.message}\n\n`;
        
        if (wait_for_completion) {
          result += 'Waiting for transcription to complete...\n\n';
          
          const statusUrl = `${config.apiUrl}/api/transcription/status/${transcribeResponse.transcription_id}`;
          const finalStatus: TranscriptionStatusResponse = await pollForCompletion(
            statusUrl, 
            config,
            ['completed'],
            ['failed'],
            120, // 120 attempts
            10000 // 10 second intervals
          );
          
          result += `✅ Transcription completed!\n`;
          result += `Final Message: ${finalStatus.message}\n`;
          result += `\nYou can now download the transcript in different formats using the 'get_transcript' tool.`;
        }
        
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }

      case 'get_transcript': {
        const { space_id, format = 'paragraphs' } = args as { space_id: string; format?: string };
        
        const transcriptUrl = `${config.apiUrl}/api/transcript/${space_id}/download/${format}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), (config.timeout || 30) * 1000);
        
        const response = await fetch(transcriptUrl, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const transcript = await response.text();
        
        return {
          content: [{
            type: 'text',
            text: `Transcript for space ${space_id} (${format} format):\n\n${transcript}`
          }]
        };
      }

      case 'list_spaces': {
        const spacesUrl = `${config.apiUrl}/api/spaces`;
        const response = await makeApiRequest(spacesUrl, config);
        
        if (!response.r2_configured) {
          return {
            content: [{
              type: 'text',
              text: 'R2 storage is not configured. No spaces available.'
            }]
          };
        }
        
        const spaces: SpaceInfo[] = response.spaces || [];
        
        if (spaces.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No spaces found. Download some Twitter Spaces to get started!'
            }]
          };
        }
        
        let result = `Found ${spaces.length} spaces:\n\n`;
        
        spaces.forEach((space, index) => {
          result += `${index + 1}. ${space.title || 'Untitled Space'}\n`;
          result += `   ID: ${space.id}\n`;
          result += `   Creator: ${space.creator_name || 'Unknown'} (@${space.creator_screen_name || 'unknown'})\n`;
          result += `   Date: ${space.start_date || 'Unknown'}\n`;
          result += `   Audio: ${space.has_audio ? '✅ Available' : '❌ Missing'}\n`;
          result += `   Transcript: ${space.has_transcript ? '✅ Available' : '❌ Not transcribed'}\n`;
          if (space.audio_size) {
            result += `   Size: ${(space.audio_size / 1024 / 1024).toFixed(2)} MB\n`;
          }
          result += `   State: ${space.state || 'Unknown'}\n\n`;
        });
        
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }

      case 'download_and_transcribe_space': {
        const { space_url } = args as { space_url: string };
        
        let result = `Starting complete process for ${space_url}\n\n`;
        
        // Step 1: Check availability
        const spaceIdMatch = space_url.match(/\/spaces\/([a-zA-Z0-9]+)/);
        if (!spaceIdMatch) {
          throw new Error('Invalid space URL format');
        }
        const spaceId = spaceIdMatch[1];
        
        result += '1. Checking space availability...\n';
        const availabilityUrl = `${config.apiUrl}/api/check-space/${spaceId}`;
        const availability: SpaceAvailabilityResponse = await makeApiRequest(availabilityUrl, config);
        
        if (!availability.available) {
          throw new Error(`Space not available: ${availability.error}`);
        }
        result += '   ✅ Space is available\n\n';
        
        // Step 2: Download
        result += '2. Starting download...\n';
        const downloadUrl = `${config.apiUrl}/api/download`;
        const downloadResponse: DownloadResponse = await makeApiRequest(downloadUrl, config, {
          method: 'POST',
          body: JSON.stringify({ space_url }),
        });
        
        result += `   Download ID: ${downloadResponse.download_id}\n`;
        
        const statusUrl = `${config.apiUrl}/api/status/${downloadResponse.download_id}`;
        const downloadStatus: StatusResponse = await pollForCompletion(statusUrl, config);
        
        result += '   ✅ Download completed\n';
        result += `   Filename: ${downloadStatus.filename}\n\n`;
        
        // Step 3: Transcribe
        result += '3. Starting transcription...\n';
        const transcribeUrl = `${config.apiUrl}/api/transcribe`;
        const transcribeResponse: TranscribeResponse = await makeApiRequest(transcribeUrl, config, {
          method: 'POST',
          body: JSON.stringify({ space_id: downloadStatus.space_id }),
        });
        
        result += `   Transcription ID: ${transcribeResponse.transcription_id}\n`;
        
        const transcribeStatusUrl = `${config.apiUrl}/api/transcription/status/${transcribeResponse.transcription_id}`;
        const transcribeStatus: TranscriptionStatusResponse = await pollForCompletion(
          transcribeStatusUrl, 
          config,
          ['completed'],
          ['failed'],
          120,
          10000
        );
        
        result += '   ✅ Transcription completed\n\n';
        
        result += `🎉 Complete! Space ${downloadStatus.space_id} has been downloaded and transcribed.\n`;
        result += `Use the 'get_transcript' tool with space_id="${downloadStatus.space_id}" to view the transcript.`;
        
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Handle MCP JSON-RPC requests
async function handleMcpRequest(request: JsonRpcRequest, config: Config): Promise<JsonRpcResponse> {
  try {
    let result: any;

    switch (request.method) {
      case 'initialize':
        result = await handleInitialize(request.params);
        break;
        
      case 'tools/list':
        result = await handleListTools();
        break;
      
      case 'tools/call':
        result = await handleCallTool(request.params, config);
        break;
      
      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    };
  }
}

// Create Express app for Streamable HTTP
const app = express();
app.use(express.json());

app.all('/mcp', async (req: Request, res: Response) => {
  try {
    // Parse configuration from query parameters
    const config = parseConfig(req.query);
    
    // Handle the MCP request
    if (req.method === 'GET') {
      // Return server info for discovery (lazy loading)
      res.json({
        ...SERVER_INFO,
        description: 'Download and transcribe Twitter Spaces using AI',
        capabilities: SERVER_CAPABILITIES,
        tools: TOOLS // Return tools without requiring config
      });
    } else if (req.method === 'POST') {
      // Handle MCP JSON-RPC protocol messages
      const response = await handleMcpRequest(req.body, config);
      res.json(response);
    } else if (req.method === 'DELETE') {
      // Handle DELETE for cleanup (optional)
      res.json({ message: 'Session ended' });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error handling MCP request:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Twitter Spaces MCP server running on port ${PORT}`);
});
