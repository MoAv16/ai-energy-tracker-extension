// AI Energy Monitor - MAIN World Fetch Interceptor
// Overrides window.fetch to read real token counts from SSE streams.
// Runs in MAIN world (page context) so it can intercept the real fetch.
// Communicates results to the isolated content script via window.postMessage.
(function() {
  function detectService(url) {
    if (url.indexOf('chatgpt.com/backend-api/conversation') !== -1 ||
        url.indexOf('chatgpt.com/backend-anon/conversation') !== -1) {
      return 'chatgpt';
    }
    if (url.indexOf('claude.ai/api/') !== -1 && url.indexOf('/completion') !== -1) {
      return 'claude';
    }
    return null;
  }

  var origFetch = window.fetch;

  window.fetch = function() {
    var args = Array.prototype.slice.call(arguments);
    var req = args[0];
    var url = typeof req === 'string' ? req : (req && req.url) || '';
    var service = detectService(url);
    var result = origFetch.apply(this, args);

    if (service) {
      result.then(function(response) {
        if (response && response.body) {
          parseSSEStream(response.clone(), service);
        }
      }).catch(function() {});
    }

    return result;
  };

  function parseSSEStream(response, service) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var promptTokens = 0;
    var responseTokens = 0;
    var hasPrompt = false;
    var hasResponse = false;
    var sent = false;

    function emit() {
      if (sent) return;
      sent = true;
      window.postMessage({
        type: 'ai-real-tokens',
        service: service,
        promptTokens: promptTokens,
        responseTokens: responseTokens
      }, '*');
    }

    function processChunk(line) {
      if (!line || line.length < 6 || line.slice(0, 6) !== 'data: ') return;
      var raw = line.slice(6).trim();
      if (raw === '[DONE]') return;

      var json;
      try { json = JSON.parse(raw); } catch (e) { return; }

      // ChatGPT: complete usage object in final streaming chunk
      if (json.usage && typeof json.usage.prompt_tokens === 'number') {
        promptTokens = json.usage.prompt_tokens;
        responseTokens = json.usage.completion_tokens || 0;
        hasPrompt = true;
        hasResponse = true;
        emit();
        return;
      }

      // Claude: input token count arrives in message_start event
      if (json.type === 'message_start' && json.message && json.message.usage) {
        promptTokens = json.message.usage.input_tokens || 0;
        hasPrompt = true;
      }

      // Claude: final output token count arrives in message_delta event
      if (json.type === 'message_delta' && json.usage &&
          typeof json.usage.output_tokens === 'number') {
        responseTokens = json.usage.output_tokens;
        hasResponse = true;
        if (hasPrompt) emit();
      }
    }

    function read() {
      reader.read().then(function(chunk) {
        if (chunk.done) return;
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          processChunk(lines[i]);
        }
        if (!sent) read();
      }).catch(function() {});
    }

    read();
  }
})();
