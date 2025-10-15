"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Bot,
    Brain,
    MessageCircle,
    Send,
    Sparkles,
    X,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
}

const QUICK_ACTIONS = [
    {
        label: "Build an AI assistant",
        prompt:
            "I'm interested in building a custom AI assistant for my customers. What would collaborating with aicorelab.dev look like?",
    },
    {
        label: "Automate workflows",
        prompt:
            "I'd like to automate parts of our internal workflow with AI. Can you help me scope that project?",
    },
    {
        label: "Launch in 10 days",
        prompt:
            "Can you walk me through how you launch AI products in 10 days and what you need from me?",
    },
    {
        label: "AI analytics",
        prompt:
            "We need AI-powered analytics dashboards for our data. How would your team approach this?",
    },
];

export function AIChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                "Hi there! 👋 I'm your AI strategist from aicorelab.dev. Tell me about the AI outcome you're chasing and I'll help you make it real.",
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isProcessingRef = useRef(false);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        isProcessingRef.current = isLoading;
    }, [isLoading]);

    const sendMessage = useCallback(async (rawContent: string) => {
        const content = rawContent.trim();
        if (!content || isProcessingRef.current) return;

        const userMessage: Message = {
            id: `${Date.now()}`,
            role: "user",
            content,
        };

        let messageHistory: Message[] = [];
        setMessages((prev) => {
            messageHistory = [...prev, userMessage];
            return messageHistory;
        });

        setInput("");
        setIsLoading(true);
        isProcessingRef.current = true;

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messages: messageHistory,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to get response");
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let aiResponse = "";
            const aiMessageId = `ai-${Date.now()}`;

            setMessages((prev) => [
                ...prev,
                {
                    id: aiMessageId,
                    role: "assistant",
                    content: "",
                },
            ]);

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    aiResponse += chunk;

                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === aiMessageId
                                ? { ...msg, content: aiResponse }
                                : msg
                        )
                    );
                }
            }
        } catch (error) {
            console.error("Error sending message:", error);
            setMessages((prev) => [
                ...prev,
                {
                    id: `error-${Date.now()}`,
                    role: "assistant",
                    content:
                        "Sorry, something went wrong on my side. Mind trying again in a moment?",
                },
            ]);
        } finally {
            setIsLoading(false);
            isProcessingRef.current = false;
        }
    }, []);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        void sendMessage(input);
    };

    const handleQuickAction = (prompt: string) => {
        setIsOpen(true);
        void sendMessage(prompt);
    };

    useEffect(() => {
        const handleOpen = (event: Event) => {
            const detail = (event as CustomEvent<{ prompt?: string }>).detail;
            setIsOpen(true);
            if (detail?.prompt) {
                void sendMessage(detail.prompt);
            }
        };

        window.addEventListener("ai-chat:open", handleOpen as EventListener);

        return () => {
            window.removeEventListener(
                "ai-chat:open",
                handleOpen as EventListener,
            );
        };
    }, [sendMessage]);

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-300"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <div
                className={cn(
                    "fixed left-0 top-0 h-full w-full sm:w-[480px] bg-gradient-to-br from-[#0B3D2E] via-[#145C43] to-[#0B3D2E] shadow-2xl z-50 flex flex-col transition-transform duration-500 ease-out",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                )}
            >
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-20 -left-20 w-64 h-64 bg-[#4ADE80]/20 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-40 -left-10 w-48 h-48 bg-[#00FFB2]/30 rounded-full blur-3xl animate-pulse delay-1000" />
                    <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl animate-pulse delay-500" />

                    {[...Array(20)].map((_, i) => (
                        <div
                            key={i}
                            className="absolute w-1 h-1 bg-[#4ADE80]/40 rounded-full animate-particle"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 5}s`,
                                animationDuration: `${3 + Math.random() * 4}s`,
                            }}
                        />
                    ))}
                </div>

                <div className="relative p-6 border-b border-white/10 backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-[#4ADE80] rounded-full animate-ping opacity-20" />
                                <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-[#4ADE80] to-[#00FFB2] flex items-center justify-center shadow-lg shadow-[#4ADE80]/50">
                                    <Bot className="w-7 h-7 text-[#0B3D2E] animate-pulse" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 border-[#0B3D2E] animate-pulse">
                                    <Sparkles className="w-3 h-3 text-white absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                                </div>
                            </div>
                            <div>
                                <h3 className="font-bold text-xl text-white flex items-center gap-2">
                                    AI Assistant
                                    <Zap className="w-4 h-4 text-[#00FFB2] animate-pulse" />
                                </h3>
                                <p className="text-sm text-[#4ADE80] flex items-center gap-1">
                                    <Brain className="w-3 h-3" />
                                    Online • Powered by Google Gemini
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsOpen(false)}
                            className="text-white hover:bg-white/10 rounded-full h-10 w-10 p-0"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                <div className="relative flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.map((message, index) => (
                        <div
                            key={message.id}
                            className={cn(
                                "flex gap-3 animate-in slide-in-from-left duration-500",
                                message.role === "user"
                                    ? "flex-row-reverse"
                                    : "flex-row",
                            )}
                            style={{ animationDelay: `${index * 100}ms` }}
                        >
                            {message.role === "assistant" && (
                                <div className="relative flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4ADE80] to-[#00FFB2] flex items-center justify-center shadow-lg">
                                        <Bot className="w-5 h-5 text-[#0B3D2E]" />
                                    </div>
                                </div>
                            )}
                            <div
                                className={cn(
                                    "relative max-w-[75%] rounded-2xl px-5 py-3 text-sm shadow-xl backdrop-blur-lg animate-in zoom-in duration-300",
                                    message.role === "user"
                                        ? "bg-gradient-to-r from-[#4ADE80] to-[#00FFB2] text-[#0B3D2E] font-medium rounded-tr-none"
                                        : "bg-white/95 text-gray-800 rounded-tl-none border border-white/20",
                                )}
                            >
                                {message.content}
                                <div
                                    className={cn(
                                        "absolute w-3 h-3 rotate-45",
                                        message.role === "user"
                                            ? "top-0 -right-1 bg-gradient-to-br from-[#00FFB2] to-[#4ADE80]"
                                            : "top-0 -left-1 bg-white/95 border-l border-t border-white/20",
                                    )}
                                />
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex gap-3 animate-in slide-in-from-left duration-500">
                            <div className="relative flex-shrink-0">
                                <div className="absolute inset-0 bg-[#4ADE80] rounded-full animate-ping opacity-30" />
                                <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-[#4ADE80] to-[#00FFB2] flex items-center justify-center shadow-lg">
                                    <Bot className="w-5 h-5 text-[#0B3D2E] animate-pulse" />
                                </div>
                            </div>
                            <div className="relative bg-white/95 rounded-2xl rounded-tl-none px-6 py-4 shadow-xl backdrop-blur-lg border border-white/20">
                                <div className="flex items-center gap-2">
                                    <div className="flex gap-1.5">
                                        <div
                                            className="w-2.5 h-2.5 bg-gradient-to-r from-[#4ADE80] to-[#00FFB2] rounded-full animate-bounce"
                                            style={{ animationDelay: "0ms" }}
                                        />
                                        <div
                                            className="w-2.5 h-2.5 bg-gradient-to-r from-[#4ADE80] to-[#00FFB2] rounded-full animate-bounce"
                                            style={{ animationDelay: "150ms" }}
                                        />
                                        <div
                                            className="w-2.5 h-2.5 bg-gradient-to-r from-[#4ADE80] to-[#00FFB2] rounded-full animate-bounce"
                                            style={{ animationDelay: "300ms" }}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500 animate-pulse ml-2">
                                        AI is thinking...
                                    </span>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="relative p-6 border-t border-white/10 backdrop-blur-xl bg-[#0B3D2E]/50">
                    <div className="mb-4 flex flex-wrap gap-2">
                        {QUICK_ACTIONS.map((action) => (
                            <button
                                key={action.label}
                                type="button"
                                disabled={isLoading}
                                onClick={() => handleQuickAction(action.prompt)}
                                className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/90 transition-all duration-300 hover:bg-white/20 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                    <form onSubmit={handleSubmit} className="relative">
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask anything or tell me what you need..."
                                    disabled={isLoading}
                                    className="w-full h-12 pl-5 pr-5 rounded-full bg-white/95 border-2 border-[#4ADE80]/20 focus:border-[#4ADE80] focus:ring-2 focus:ring-[#4ADE80]/20 text-gray-800 placeholder:text-gray-400 shadow-lg backdrop-blur-lg"
                                />
                                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#4ADE80]/0 via-[#4ADE80]/20 to-[#4ADE80]/0 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                            </div>
                            <Button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                size="icon"
                                className="h-12 w-12 rounded-full bg-gradient-to-r from-[#4ADE80] to-[#00FFB2] hover:from-[#00FFB2] hover:to-[#4ADE80] text-[#0B3D2E] shadow-lg shadow-[#4ADE80]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-110 active:scale-95"
                            >
                                <Send className="w-5 h-5" />
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed left-0 top-1/2 -translate-y-1/2 z-40 group"
                >
                    <div className="relative bg-gradient-to-br from-[#4ADE80] to-[#00FFB2] p-4 rounded-r-2xl shadow-2xl shadow-[#4ADE80]/50 transition-all duration-300 hover:pr-6 animate-in slide-in-from-left">
                        <div className="absolute inset-0 bg-white/20 rounded-r-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <MessageCircle className="w-6 h-6 text-[#0B3D2E] relative z-10 animate-pulse" />
                        <div className="absolute inset-0 rounded-r-2xl bg-[#4ADE80] animate-ping opacity-20" />
                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-lg px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap border border-[#4ADE80]/20">
                            <span className="text-xs font-semibold text-[#0B3D2E]">
                                💬 Chat with AI
                            </span>
                        </div>
                    </div>
                </button>
            )}
        </>
    );
}
