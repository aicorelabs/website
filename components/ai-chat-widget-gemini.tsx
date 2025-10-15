"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
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

    // Use Vercel AI SDK's useChat hook for streaming responses from Gemini
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        isLoading,
        append,
    } = useChat({
        api: "/api/chat",
        body: {
            userData,
            currentStep,
        },
        initialMessages: [
            {
                id: "1",
                role: "assistant",
                content:
                    "Hi! 👋 I'm your AI assistant powered by Google Gemini. I'd love to learn more about your AI project. What's your name?",
            },
        ],
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        // Update step and userData after each AI response
        const lastUserMessage = messages.filter((m: any) => m.role === "user")
            .pop();
        if (!lastUserMessage) return;

        const newUserData = { ...userData };
        let nextStep = currentStep;

        switch (currentStep) {
            case "name":
                if (lastUserMessage.content.trim()) {
                    newUserData.name = lastUserMessage.content.trim();
                    nextStep = "email";
                }
                break;
            case "email":
                if (lastUserMessage.content.trim()) {
                    newUserData.email = lastUserMessage.content.trim();
                    nextStep = "company";
                }
                break;
            case "company":
                if (lastUserMessage.content.trim()) {
                    newUserData.company = lastUserMessage.content.trim();
                    nextStep = "project";
                }
                break;
            case "project":
                if (lastUserMessage.content.trim()) {
                    newUserData.projectType = lastUserMessage.content.trim();
                    nextStep = "budget";
                }
                break;
            case "budget":
                if (lastUserMessage.content.trim()) {
                    newUserData.budget = lastUserMessage.content.trim();
                    nextStep = "timeline";
                }
                break;
            case "timeline":
                if (lastUserMessage.content.trim()) {
                    newUserData.timeline = lastUserMessage.content.trim();
                    nextStep = "complete";

                    // Log completed data
                    console.log("✅ Form completed! User data:", newUserData);
                    console.log("📋 Ready to save to Supabase!");

                    // TODO: Save to Supabase
                    // await saveLeadToSupabase(newUserData);
                }
                break;
        }

        if (nextStep !== currentStep) {
            setUserData(newUserData);
            setCurrentStep(nextStep);
        }
    }, [messages]);

    const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        handleSubmit(e, {
            body: {
                userData,
                currentStep,
            },
        });
    };

    return (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
            {/* Chat Widget */}
            {isOpen && (
                <Card className="w-[calc(100vw-2rem)] sm:w-96 h-[500px] sm:h-[600px] mb-4 flex flex-col shadow-2xl border-2 border-[#4ADE80]/20 animate-in slide-in-from-bottom-4 duration-300">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-[#0B3D2E] to-[#145C43] text-white rounded-t-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#4ADE80] flex items-center justify-center">
                                <MessageCircle className="w-5 h-5 text-[#0B3D2E]" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm">
                                    AI Assistant (Gemini)
                                </h3>
                                <p className="text-xs text-gray-200">
                                    {currentStep === "complete"
                                        ? "All set! 🎉"
                                        : "Online • Powered by Google AI"}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsOpen(false)}
                            className="text-white hover:bg-white/10"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                        {messages.map((message: any) => (
                            <div
                                key={message.id}
                                className={cn(
                                    "flex gap-2 animate-in slide-in-from-bottom-2",
                                    message.role === "user"
                                        ? "justify-end"
                                        : "justify-start",
                                )}
                            >
                                {message.role === "assistant" && (
                                    <div className="w-8 h-8 rounded-full bg-[#4ADE80] flex items-center justify-center flex-shrink-0 mt-1">
                                        <MessageCircle className="w-4 h-4 text-[#0B3D2E]" />
                                    </div>
                                )}
                                <div
                                    className={cn(
                                        "max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-line",
                                        message.role === "user"
                                            ? "bg-[#0B3D2E] text-white rounded-br-none"
                                            : "bg-white text-gray-800 rounded-bl-none shadow-sm border border-gray-200",
                                    )}
                                >
                                    {message.content}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-2 justify-start animate-in slide-in-from-bottom-2">
                                <div className="w-8 h-8 rounded-full bg-[#4ADE80] flex items-center justify-center flex-shrink-0 mt-1">
                                    <MessageCircle className="w-4 h-4 text-[#0B3D2E]" />
                                </div>
                                <div className="bg-white rounded-2xl rounded-bl-none px-4 py-3 shadow-sm border border-gray-200">
                                    <div className="flex gap-1">
                                        <div
                                            className="w-2 h-2 bg-[#4ADE80] rounded-full animate-bounce"
                                            style={{ animationDelay: "0ms" }}
                                        />
                                        <div
                                            className="w-2 h-2 bg-[#4ADE80] rounded-full animate-bounce"
                                            style={{ animationDelay: "150ms" }}
                                        />
                                        <div
                                            className="w-2 h-2 bg-[#4ADE80] rounded-full animate-bounce"
                                            style={{ animationDelay: "300ms" }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    {currentStep !== "complete" && (
                        <form
                            onSubmit={onSubmit}
                            className="p-4 border-t bg-white rounded-b-lg"
                        >
                            <div className="flex gap-2">
                                <Input
                                    value={input}
                                    onChange={handleInputChange}
                                    placeholder="Type your message..."
                                    disabled={isLoading}
                                    className="flex-1 rounded-full border-gray-300 focus:border-[#4ADE80] focus:ring-[#4ADE80]"
                                />
                                <Button
                                    type="submit"
                                    disabled={!input.trim() || isLoading}
                                    size="icon"
                                    className="rounded-full bg-[#0B3D2E] hover:bg-[#145C43] text-white flex-shrink-0"
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </form>
                    )}
                </Card>
            )}

            {/* Floating Button */}
            <Button
                onClick={() => setIsOpen(!isOpen)}
                size="lg"
                className={cn(
                    "rounded-full w-14 h-14 sm:w-16 sm:h-16 shadow-2xl transition-all duration-300 hover:scale-110",
                    isOpen
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-[#00FFB2] hover:bg-[#4ADE80] glow-effect",
                )}
            >
                {isOpen
                    ? <X className="w-6 h-6 text-white" />
                    : <MessageCircle className="w-6 h-6 text-[#0B3D2E]" />}
            </Button>
        </div>
    );
}
