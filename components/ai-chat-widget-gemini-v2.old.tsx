"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

interface UserData {
    name?: string;
    email?: string;
    company?: string;
    projectType?: string;
    budget?: string;
    timeline?: string;
}

export function AIChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "1",
            role: "assistant",
            content:
                "Hi! 👋 I'm your AI assistant powered by Google Gemini. I'd love to learn more about your AI project. What's your name?",
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [userData, setUserData] = useState<UserData>({});
    const [currentStep, setCurrentStep] = useState<
        | "name"
        | "email"
        | "company"
        | "project"
        | "budget"
        | "timeline"
        | "complete"
    >("name");

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim(),
        };

        setMessages((prev) => [...prev, userMessage]);
        const currentInput = input.trim();
        setInput("");
        setIsLoading(true);

        // Update userData based on current step
        const newUserData = { ...userData };
        let nextStep = currentStep;

        switch (currentStep) {
            case "name":
                newUserData.name = currentInput;
                nextStep = "email";
                break;
            case "email":
                newUserData.email = currentInput;
                nextStep = "company";
                break;
            case "company":
                newUserData.company = currentInput;
                nextStep = "project";
                break;
            case "project":
                newUserData.projectType = currentInput;
                nextStep = "budget";
                break;
            case "budget":
                newUserData.budget = currentInput;
                nextStep = "timeline";
                break;
            case "timeline":
                newUserData.timeline = currentInput;
                nextStep = "complete";

                // Log completed data
                console.log("✅ Form completed! User data:", newUserData);
                console.log("📋 Ready to save to Supabase!");

                // TODO: Save to Supabase
                // await saveToSupabase(newUserData);
                break;
        }

        setUserData(newUserData);
        setCurrentStep(nextStep);

        try {
            // Call the Gemini API
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    userData: newUserData,
                    currentStep: nextStep,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to get response");
            }

            // Handle streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let aiResponse = "";
            const aiMessageId = (Date.now() + 1).toString();

            // Add placeholder message
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

                    // Update the AI message with streaming content
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
            // Add error message
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: "Sorry, I encountered an error. Please try again.",
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        handleSendMessage();
    };

    return (
        <>
            {/* Backdrop Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-300"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div
                className={cn(
                    "fixed left-0 top-0 h-full w-full sm:w-[480px] bg-gradient-to-br from-[#0B3D2E] via-[#145C43] to-[#0B3D2E] shadow-2xl z-50 flex flex-col transition-transform duration-500 ease-out",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                )}
            >
                {/* Animated Background Effects */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Gradient Orbs */}
                    <div className="absolute top-20 -left-20 w-64 h-64 bg-[#4ADE80]/20 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-40 -left-10 w-48 h-48 bg-[#00FFB2]/30 rounded-full blur-3xl animate-pulse delay-1000" />
                    <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl animate-pulse delay-500" />

                    {/* Floating Particles */}
                    {[...Array(20)].map((_, i) => (
                        <div
                            key={i}
                            className="absolute w-1 h-1 bg-[#4ADE80]/40 rounded-full animate-float"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 5}s`,
                                animationDuration: `${3 + Math.random() * 4}s`,
                            }}
                        />
                    ))}
                </div>

                {/* Header */}
                <div className="relative p-6 border-b border-white/10 backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {/* AI Avatar with Animation */}
                            <div className="relative">
                                <div className="absolute inset-0 bg-[#4ADE80] rounded-full animate-ping opacity-20" />
                                <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-[#4ADE80] to-[#00FFB2] flex items-center justify-center shadow-lg shadow-[#4ADE80]/50">
                                    <Bot className="w-7 h-7 text-[#0B3D2E] animate-pulse" />
                                </div>
                                {/* Status Indicator */}
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
                                    {currentStep === "complete"
                                        ? "All done! 🎉"
                                        : "Powered by Google Gemini"}
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

                {/* Messages Container */}
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
                                {/* Message Tail */}
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

                    {/* Enhanced Typing Indicator */}
                    {isLoading && (
                        <div className="flex gap-3 animate-in slide-in-from-left duration-500">
                            <div className="relative flex-shrink-0">
                                <div className="absolute inset-0 bg-[#4ADE80] rounded-full animate-ping opacity-30" />
                                <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-[#4ADE80] to-[#00FFB2] flex items-center justify-center shadow-lg">
                                    <Bot className="w-5 h-5 text-[#0B3D2E] animate-pulse" />
                                </div>
                            </div>
                            <div className="relative bg-white/95 rounded-2xl rounded-tl-none px-6 py-4 shadow-xl backdrop-blur-lg border border-white/20">
                                {/* Advanced Typing Animation */}
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
                                {/* Shimmer Effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                {currentStep !== "complete" && (
                    <div className="relative p-6 border-t border-white/10 backdrop-blur-xl bg-[#0B3D2E]/50">
                        <form onSubmit={onSubmit} className="relative">
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <Input
                                        value={input}
                                        onChange={(e) =>
                                            setInput(e.target.value)}
                                        placeholder="Type your message..."
                                        disabled={isLoading}
                                        className="w-full h-12 pl-5 pr-5 rounded-full bg-white/95 border-2 border-[#4ADE80]/20 focus:border-[#4ADE80] focus:ring-2 focus:ring-[#4ADE80]/20 text-gray-800 placeholder:text-gray-400 shadow-lg backdrop-blur-lg"
                                    />
                                    {/* Input Glow Effect */}
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
                )}

                {/* Progress Indicator */}
                {currentStep !== "complete" && (
                    <div className="absolute bottom-24 right-6 bg-white/90 backdrop-blur-lg rounded-full px-4 py-2 shadow-lg border border-white/20">
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                                {[
                                    "name",
                                    "email",
                                    "company",
                                    "project",
                                    "budget",
                                    "timeline",
                                ].map((step, i) => (
                                    <div
                                        key={step}
                                        className={cn(
                                            "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                            [
                                                    "name",
                                                    "email",
                                                    "company",
                                                    "project",
                                                    "budget",
                                                    "timeline",
                                                ].indexOf(currentStep) >= i
                                                ? "bg-gradient-to-r from-[#4ADE80] to-[#00FFB2] w-6"
                                                : "bg-gray-300",
                                        )}
                                    />
                                ))}
                            </div>
                            <span className="text-xs text-gray-600 font-medium">
                                {[
                                    "name",
                                    "email",
                                    "company",
                                    "project",
                                    "budget",
                                    "timeline",
                                ].indexOf(currentStep) + 1}/6
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Trigger Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed left-0 top-1/2 -translate-y-1/2 z-40 group"
                >
                    {/* Main Button */}
                    <div className="relative bg-gradient-to-br from-[#4ADE80] to-[#00FFB2] p-4 rounded-r-2xl shadow-2xl shadow-[#4ADE80]/50 transition-all duration-300 hover:pr-6 animate-in slide-in-from-left">
                        <div className="absolute inset-0 bg-white/20 rounded-r-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <MessageCircle className="w-6 h-6 text-[#0B3D2E] relative z-10 animate-pulse" />

                        {/* Pulse Rings */}
                        <div className="absolute inset-0 rounded-r-2xl bg-[#4ADE80] animate-ping opacity-20" />

                        {/* Side Label */}
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
