# Twitter Spaces MCP Server

An MCP (Model Context Protocol) server for downloading and transcribing Twitter Spaces using AI.

## Features

- ✅ Check Twitter Space availability
- 📥 Download Twitter Spaces  
- 🎤 AI-powered transcription using Deepgram
- 📝 Multiple transcript formats (JSON, TXT, Paragraphs, Time-coded, Summary)
- 📋 List all downloaded spaces
- 🔄 Complete download + transcription workflow

## Tools

### `check_space_availability`
Check if a Twitter Space is available for download.

**Parameters:**
- `space_url` (string): Full Twitter Space URL

### `download_twitter_space`
Download a Twitter Space and optionally wait for completion.

**Parameters:**
- `space_url` (string): Full Twitter Space URL
- `wait_for_completion` (boolean): Whether to wait for completion

### `transcribe_space`
Transcribe a downloaded Twitter Space using AI.

**Parameters:**
- `space_id` (string): Space ID (extracted from URL)
- `wait_for_completion` (boolean): Whether to wait for completion

### `get_transcript`
Download transcript in various formats.

**Parameters:**
- `space_id` (string): Space ID
- `format` (string): Format (json, txt, paragraphs, timecoded, summary)

### `list_spaces`
List all downloaded Twitter Spaces.

### `download_and_transcribe_space`
Complete workflow: download and transcribe a space.

**Parameters:**
- `space_url` (string): Full Twitter Space URL

## Configuration

- `apiUrl` (required): Base URL of the Twitter Spaces API backend
- `timeout` (optional): Request timeout in seconds (default: 30)

## Usage Examples

1. **Check if a space is available:**




Use check_space_availability with space_url="https://x.com/i/spaces/1ZkKzYLnWOLxv"


2. **Download and transcribe in one step:**




Use download_and_transcribe_space with space_url="https://x.com/i/spaces/1ZkKzYLnWOLxv"


3. **Get transcript with speaker diarization:**




Use get_transcript with space_id="1ZkKzYLnWOLxv" and format="paragraphs"

Code



## Backend Requirements

This MCP server requires a compatible Twitter Spaces API backend running with the following endpoints:
- POST /api/download
- GET /api/status/{download_id}
- POST /api/transcribe  
- GET /api/transcription/status/{transcription_id}
- GET /api/transcript/{space_id}/download/{format}
- GET /api/spaces
- GET /api/check-space/{space_id}