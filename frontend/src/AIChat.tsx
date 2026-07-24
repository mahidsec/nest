import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark-dimmed.css";
import "highlight.js/lib/languages/dart";
import { Loader, Send, Bot, User, ChevronDown, Plus, Copy, Check } from "lucide-react";

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
        themeVariables: {
          primaryColor: "#3b82f6",
          primaryTextColor: "#f8fafc",
          primaryBorderColor: "#60a5fa",
          lineColor: "#94a3b8",
          textColor: "#f1f5f9",
          mainBkg: "#1e293b",
          nodeBorder: "#60a5fa",
          clusterBkg: "#1e293b",
          titleColor: "#f1f5f9",
          edgeLabelBackground: "#0f172a",
        },
        securityLevel: "loose",
      });
    });
  }
  return mermaidLoadPromise;
}

function MermaidBlock({
  chart,
  isStreaming,
}: {
  chart: string;
  isStreaming?: boolean;
}) {
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
        const saved = localStorage.getItem("nest_ai_model");
        if (saved && ms.some((m: any) => m.id === saved)) {
          setSelectedModel(saved);
        } else {
          // Default to mimo-2.5-free if available
          const mimo = ms.find(
            (m: any) => m.id.startsWith("mimo") || m.id.includes("mimo"),
          );
          setSelectedModel(mimo?.id || ms[0]?.id || "");
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

  const sendMessage = useCallback(
    async (isRetry = false) => {
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
        if (!reader) {
          console.error("[AI Chat] No reader from response body");
          return;
        }
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
                throw new Error(
                  typeof json.error === "string"
                    ? json.error
                    : json.error.message || "API Error",
                );
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
            throw new Error(
              typeof json.error === "string"
                ? json.error
                : json.error.message || "API Error",
            );
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
        console.error("[AI Chat] Error:", err);
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
    },
    [input, selectedModel, messages, streaming, context],
  );

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
                localStorage.setItem("nest_ai_model", e.target.value);
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
          if (
            streaming &&
            i === messages.length - 1 &&
            !msg.content &&
            !msg.reasoning
          )
            return null;
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
                {msg.role === "user" ? <User size={12} /> : <Bot size={12} />}
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
                      <details
                        className="text-[10px] text-base-content/60 bg-base-300/30 rounded p-2"
                        open={
                          streaming && i === messages.length - 1 && !msg.content
                        }
                      >
                        <summary className="cursor-pointer select-none font-bold outline-none">
                          Thought Process
                        </summary>
                        <div className="mt-2 whitespace-pre-wrap">
                          {msg.reasoning}
                        </div>
                      </details>
                    )}
                    {msg.isError ? (
                      <div className="flex flex-col items-start gap-2 text-error">
                        <span className="font-bold whitespace-pre-wrap">
                          {msg.content}
                        </span>
                        <button
                          onClick={() => sendMessage(true)}
                          className="btn btn-error btn-xs font-bold uppercase tracking-widest text-white mt-1"
                        >
                          Retry
                        </button>
                      </div>
                    ) : (
                      msg.content && (
                        <MarkdownRenderer
                          content={msg.content}
                          isStreaming={streaming && i === messages.length - 1}
                        />
                      )
                    )}
                    {!msg.isError &&
                      !msg.content &&
                      msg.reasoning &&
                      streaming &&
                      i === messages.length - 1 && (
                        <span className="animate-pulse">...</span>
                      )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          );
        })}
        {streaming &&
          !messages[messages.length - 1]?.content &&
          !messages[messages.length - 1]?.reasoning && (
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

function CopyableCodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const getText = (node: React.ReactNode): string => {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(getText).join("");
    if (node && typeof node === "object" && "props" in node) {
      return getText(((node as React.ReactElement).props as any).children);
    }
    return "";
  };

  const handleCopy = async () => {
    const t = getText(children);
    await navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="overflow-x-auto bg-base-300/40 border border-base-300/50 rounded-lg p-3 text-[10px] my-1">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-base-200/80 hover:bg-base-300 text-base-content/50 hover:text-base-content opacity-0 group-hover:opacity-100 transition-all duration-200"
        title="Copy code"
      >
        {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

// ─── Markdown renderer with math & mermaid support ───
function MarkdownRenderer({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  // During streaming, skip rehypeKatex so partial $...$ tokens don't cause
  // layout glitches — remarkMath still parses but katex renders after stream ends
  const rehypePlugins: any[] = isStreaming
    ? [rehypeHighlight]
    : [rehypeHighlight, rehypeKatex];

  return (
    <div className="overflow-x-auto max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:my-6 [&_.katex-display]:py-4 [&_.katex]:text-[0.85em]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePlugins}
        components={{
          p({ children }) {
            return <p className="mb-2 last:mb-0 text-[11px] leading-relaxed">{children}</p>;
          },
          h1({ children }) {
            return <h1 className="text-base font-bold mt-4 mb-3 text-base-content">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-sm font-bold mt-4 mb-3 text-base-content border-b border-base-300 pb-0.5">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-xs font-bold mt-3 mb-2 text-base-content">{children}</h3>;
          },
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match?.[1];
            if (lang === "mermaid") {
              return (
                <MermaidBlock
                  chart={String(children)}
                  isStreaming={isStreaming}
                />
              );
            }
            if (match) {
              return <code className={className}>{children}</code>;
            }
            // Inline code
            return (
              <code className="bg-base-300/60 px-1 py-0.5 rounded text-[10px] text-primary/90 break-words">
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <CopyableCodeBlock>{children}</CopyableCodeBlock>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-1 space-y-0.5 text-[11px]">{children}</ol>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-1 space-y-0.5 text-[11px]">{children}</ul>;
          },
          li({ children }) {
            return <li className="marker:text-base-content/40 text-[11px]">{children}</li>;
          },
          blockquote({ children }) {
            return <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-base-content/70 italic text-[11px]">{children}</blockquote>;
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2 w-full">
                <table className="table table-xs table-zebra w-full text-[11px] border border-base-300 rounded-lg">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-base-300/50 text-base-content/80 text-[10px] uppercase tracking-wider font-bold">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-base-300/50">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="hover:bg-base-300/20 transition-colors">{children}</tr>;
          },
          th({ children }) {
            return <th className="px-3 py-1.5 text-left whitespace-nowrap border-b border-base-300">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-1.5 border-b border-base-300/30">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
