import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Loader, Send, Bot, User, ChevronDown, Plus } from "lucide-react";

const API = window.location.origin;

interface Model {
  id: string;
  name?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  isError?: boolean;
}

// ─── Lazy load Mermaid on first usage ───
let mermaidLoadPromise: Promise<void> | null = null;
function loadMermaid(): Promise<void> {
  if (!mermaidLoadPromise) {
    mermaidLoadPromise = import("mermaid").then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
      });
    });
  }
  return mermaidLoadPromise;
}

function MermaidBlock({ chart, isStreaming }: { chart: string, isStreaming?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isStreaming) return; // Wait until stream finishes to prevent flickering and syntax errors
    
    let isMounted = true;
    loadMermaid()
      .then(async () => {
        if (!ref.current) return;
        const mod = await import("mermaid");
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const cleanChart = chart.trim();
        try {
          // Remove any stray element from previous failed render
          const existing = document.getElementById(id);
          if (existing) existing.remove();

          const { svg } = await mod.default.render(id, cleanChart);
          if (isMounted && ref.current) {
            ref.current.innerHTML = svg;
            setError(false);
          }
        } catch (e) {
          // Silent catch to prevent console spam
          const errEl = document.getElementById(`d${id}`);
          if (errEl) errEl.remove();
          if (isMounted) setError(true);
        }
      })
      .catch((e) => {
        // Silent catch for load errors
        if (isMounted) setError(true);
      });
    return () => {
      isMounted = false;
    };
  }, [chart, isStreaming]);

  if (isStreaming || error) {
    return (
      <pre className="bg-base-300 p-2 rounded text-[10px] overflow-x-auto w-full my-2">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div className="my-3 flex flex-col items-center w-full">
      <div ref={ref} className="flex justify-center overflow-x-auto w-full" />
    </div>
  );
}

export default function AIChat({
  context,
  onClose,
}: {
  context?: string;
  onClose?: () => void;
}) {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const chatEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const resetChat = () => {
    setMessages([]);
    setInput("");
  };

  // Fetch models
  useEffect(() => {
    fetch(`${API}/api/ai/models`)
      .then((r) => r.json())
      .then((d) => {
        const ms = d?.data || [];
        setModels(ms);
        const saved = localStorage.getItem('nest_ai_model');
        if (saved && ms.some((m: any) => m.id === saved)) {
          setSelectedModel(saved);
        } else {
          // Default to mimo-2.5-free if available
          const mimo = ms.find((m: any) => m.id.startsWith('mimo') || m.id.includes('mimo'));
          setSelectedModel(mimo?.id || ms[0]?.id || '');
        }
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length > 0 || streaming) {
      chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, streaming]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [input]);

  const sendMessage = useCallback(async (isRetry = false) => {
    const text = input.trim();
    if (!isRetry && !text) return;
    if (!selectedModel || streaming) return;

    let currentHistory = [...messages];

    if (isRetry) {
      currentHistory.pop(); // Remove the failed assistant message
      setMessages([...currentHistory]);
    } else {
      currentHistory = [...currentHistory, { role: "user", content: text }];
      setMessages(currentHistory);
      setInput("");
    }

    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...currentHistory, assistantMsg]);

    try {
      const resp = await fetch(`${API}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: currentHistory,
          context,
        }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) { console.error('[AI Chat] No reader from response body'); return; }
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        done = d;
        if (value) buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            let json;
            try {
              json = JSON.parse(line.slice(6));
            } catch (e) {
              continue;
            }
            
            if (json.error) {
              throw new Error(typeof json.error === 'string' ? json.error : json.error.message || 'API Error');
            }

            const deltaContent = json?.choices?.[0]?.delta?.content || "";
            const deltaReasoning = json?.choices?.[0]?.delta?.reasoning || "";
            if (deltaContent || deltaReasoning) {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + deltaContent,
                    reasoning: (last.reasoning || "") + deltaReasoning,
                  };
                }
                return copy;
              });
            }
          }
        }
      }
      // flush buffer
      if (buffer.trim() && !buffer.includes("[DONE]")) {
          let json;
          try {
            json = JSON.parse(buffer.slice(6));
          } catch (e) {
            // ignore
          }
          if (json && json.error) {
            throw new Error(typeof json.error === 'string' ? json.error : json.error.message || 'API Error');
          }
          const deltaContent = json?.choices?.[0]?.delta?.content || "";
          const deltaReasoning = json?.choices?.[0]?.delta?.reasoning || "";
          if (deltaContent || deltaReasoning) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + deltaContent,
                  reasoning: (last.reasoning || "") + deltaReasoning,
                };
              }
              return copy;
            });
          }
      }
    } catch (err: any) {
      console.error('[AI Chat] Error:', err);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: `Error: ${err.message || "Failed to connect"}`,
            isError: true,
          };
        }
        return copy;
      });
    }
    setStreaming(false);
  }, [input, selectedModel, messages, streaming, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-base-300 bg-base-200/50 shrink-0">
        <Bot size={16} className="text-primary shrink-0" />
        <span className="text-xs font-bold uppercase tracking-widest text-base-content/70">
          AI Tutor
        </span>
        <button
          onClick={resetChat}
          className="btn btn-xs btn-square text-base-content/60 hover:text-base-content min-h-0 h-6 w-6 border border-base-300 hover:border-base-content/30 bg-base-200/50 hover:bg-base-200 ml-auto"
          title="New Chat"
        >
          <Plus size={12} />
        </button>
        {modelsLoading ? (
          <Loader size={12} className="animate-spin text-base-content/30" />
        ) : (
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                localStorage.setItem('nest_ai_model', e.target.value);
              }}
              className="select select-ghost select-xs text-[10px] font-bold uppercase tracking-widest pr-6 appearance-none bg-transparent bg-none"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
            <ChevronDown
              size={10}
              className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-base-content/40"
            />
          </div>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="btn btn-xs btn-square text-base-content/60 hover:text-base-content min-h-0 h-6 w-6 border border-base-300 hover:border-base-content/30 bg-base-200/50 hover:bg-base-200"
            title="Close"
          >
            <Plus size={12} className="rotate-45" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Bot size={32} className="text-primary/30 mb-3" />
            <p className="text-xs font-bold uppercase tracking-widest text-base-content/30">
              Ask anything about this lesson
            </p>

          </div>
        )}
        {messages.map((msg, i) => {
          if (streaming && i === messages.length - 1 && !msg.content && !msg.reasoning) return null;
          return (
          <div
            key={i}
            className={`flex gap-2 ${
              msg.role === "user" ? "flex-row-reverse" : ""
            }`}
          >
            <div
              className={`hidden md:flex w-6 h-6 rounded-full items-center justify-center shrink-0 ${
                msg.role === "user"
                  ? "bg-primary/20 text-primary"
                  : "bg-accent/20 text-accent"
              }`}
            >
              {msg.role === "user" ? (
                <User size={12} />
              ) : (
                <Bot size={12} />
              )}
            </div>
            <div
              className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "max-w-[85%] bg-primary/10 text-base-content rounded-tr-sm"
                  : "w-[95%] bg-base-200 border border-base-300 rounded-tl-sm markdown-content"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="flex flex-col gap-2">
                  {msg.reasoning && (
                    <details className="text-[10px] text-base-content/60 bg-base-300/30 rounded p-2" open={streaming && i === messages.length - 1 && !msg.content}>
                      <summary className="cursor-pointer select-none font-bold outline-none">Thought Process</summary>
                      <div className="mt-2 whitespace-pre-wrap">{msg.reasoning}</div>
                    </details>
                  )}
                  {msg.isError ? (
                    <div className="flex flex-col items-start gap-2 text-error">
                      <span className="font-bold whitespace-pre-wrap">{msg.content}</span>
                      <button 
                        onClick={() => sendMessage(true)}
                        className="btn btn-error btn-xs font-bold uppercase tracking-widest text-white mt-1"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    msg.content && <MarkdownRenderer content={msg.content} isStreaming={streaming && i === messages.length - 1} />
                  )}
                  {!msg.isError && !msg.content && msg.reasoning && streaming && i === messages.length - 1 && (
                    <span className="animate-pulse">...</span>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        )})}
        {streaming && !messages[messages.length - 1]?.content && !messages[messages.length - 1]?.reasoning && (
          <div className="flex gap-2">
            <div className="hidden md:flex w-6 h-6 rounded-full items-center justify-center shrink-0 bg-accent/20 text-accent">
              <Bot size={12} />
            </div>
            <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs bg-base-200 border border-base-300 rounded-tl-sm">
              <span className="animate-pulse">...</span>
            </div>
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-base-300 bg-base-200/30 shrink-0">
        <div className="flex gap-2 items-stretch">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            rows={1}
            className="textarea textarea-bordered textarea-sm flex-1 min-h-[36px] max-h-[120px] resize-none text-xs bg-base-100 border-base-300"
            disabled={streaming}
          />
          <button
            onClick={() => sendMessage(false)}
            disabled={!input.trim() || !selectedModel || streaming}
            className="btn btn-sm btn-primary w-9 p-0 h-auto"
          >
            {streaming ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Markdown renderer with math & mermaid support ───
function MarkdownRenderer({ content, isStreaming }: { content: string, isStreaming?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || "");
          const lang = match?.[1];
          if (lang === "mermaid") {
            return <MermaidBlock chart={String(children)} isStreaming={isStreaming} />;
          }
          if (match) {
            return <code className={className}>{children}</code>;
          }
          return (
            <code className="bg-base-300 px-1 py-0.5 rounded text-[10px]">
              {children}
            </code>
          );
        },
        pre({ children }) {
          return <pre className="overflow-x-auto text-[10px]">{children}</pre>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
