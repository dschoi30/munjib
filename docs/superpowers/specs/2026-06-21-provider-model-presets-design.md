# Provider Model Presets Design

## Context

Workspace AI settings can switch the chat provider at runtime through client-side overrides. The current preset list is OpenRouter-only, and reset clears the override back to the server default. Users need provider-specific presets and reset behavior so OpenRouter, OpenAI, and Ollama can be switched from the settings panel without changing server env values.

## Design

Define provider-specific chat model presets in `lib/rag/client-model-settings.ts`. The settings panel will render presets for the selected provider, continue to accept custom model IDs, and save overrides as `{ chatProvider, chatModel }`.

Provider defaults:

- OpenRouter / OpenAI-compatible reset saves `openai-compatible` with `google/gemma-4-31b-it:free`.
- OpenAI reset saves `openai` with `gpt-5.4-mini`.
- Ollama reset saves `ollama` with `gemma:e4b`.

Presets:

- OpenRouter keeps the existing OpenRouter model list and custom model input.
- OpenAI adds `gpt-5.4-mini`, `gpt-5.4`, and `gpt-4.1-mini`.
- Ollama adds `gemma:e4b`.

The settings dialog height will be fixed to 80 percent of the browser viewport with internal scrolling kept inside the content pane.

## Error Handling

Existing validation remains the boundary for malformed model IDs and incompatible provider/model combinations. Reset writes use the same storage validation path as preset and custom model saves, so failures surface through the existing settings status message.

## Testing

Update client model setting tests for the new provider presets and reset defaults. Update settings panel tests so provider-specific presets render for OpenRouter, OpenAI, and Ollama, reset writes the provider default instead of clearing storage, and the dialog has the fixed 80vh sizing class.
