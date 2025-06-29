import { createMcpServer } from '@smithery/sdk';

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

const server = createMcpServer({
  name: 'twitter-spaces',
  version: '1.0.0',
  description: 'Download and transcribe Twitter Spaces using AI',
});

// Tool 1: Check Space Availability
server.tool({
  name: 'check_space_availability',
  description: 'Check if a Twitter Space is available for download',
  parameters: {
    type: 'object',
    properties: {
      space_url: {
        type: 'string',
        description: 'Full Twitter Space URL (e.g., https://x.com/i/spaces/1ZkKzYLnWOLxv)',
      },
    },
    required: ['space_url'],
  },
}, async ({ space_url }, config: Config) => {
  try {
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
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error checking space availability: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
});

// Tool 2: Download Twitter Space
server.tool({
  name: 'download_twitter_space',
  description: 'Download a Twitter Space and wait for completion',
  parameters: {
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
}, async ({ space_url, wait_for_completion = true }, config: Config) => {
  try {
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
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error downloading space: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
});

// Tool 3: Transcribe Space
server.tool({
  name: 'transcribe_space',
  description: 'Transcribe a downloaded Twitter Space using AI',
  parameters: {
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
}, async ({ space_id, wait_for_completion = true }, config: Config) => {
  try {
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
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error transcribing space: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
});

// Tool 4: Get Transcript
server.tool({
  name: 'get_transcript',
  description: 'Download transcript in various formats (json, txt, paragraphs, timecoded, summary)',
  parameters: {
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
}, async ({ space_id, format = 'paragraphs' }, config: Config) => {
  try {
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
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error getting transcript: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
});

// Tool 5: List Spaces
server.tool({
  name: 'list_spaces',
  description: 'List all downloaded Twitter Spaces',
  parameters: {
    type: 'object',
    properties: {},
  },
}, async ({}, config: Config) => {
  try {
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
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error listing spaces: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
});

// Tool 6: Download Complete Space (Download + Transcribe)
server.tool({
  name: 'download_and_transcribe_space',
  description: 'Download a Twitter Space and automatically transcribe it',
  parameters: {
    type: 'object',
    properties: {
      space_url: {
        type: 'string',
        description: 'Full Twitter Space URL (e.g., https://x.com/i/spaces/1ZkKzYLnWOLxv)',
      },
    },
    required: ['space_url'],
  },
}, async ({ space_url }, config: Config) => {
  try {
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
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error in complete process: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
});

export default server;
