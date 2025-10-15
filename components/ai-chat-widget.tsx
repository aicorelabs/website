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
  timestamp: Date;
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
        "Hi! 👋 I'm your AI assistant. I'd love to learn more about your project. What's your name?",
      timestamp: new Date(),
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
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const getNextQuestion = (
    step: typeof currentStep,
    data: UserData,
  ): string => {
    const questions: Record<typeof currentStep, string> = {
      name:
        `Hi! 👋 I'm your AI assistant. I'd love to learn more about your project. What's your name?`,
      email:
        `Nice to meet you, ${data.name}! 🎉 What's your email address so we can send you a proposal?`,
      company: `Great! What's your company name?`,
      project:
        `Tell me about your project. What kind of AI solution are you looking for? (e.g., chatbot, automation, analytics, etc.)`,
      budget:
        `What's your budget range for this project? (e.g., $10k-$25k, $25k-$50k, $50k+)`,
      timeline:
        `When would you like to launch? (e.g., ASAP, 1-2 months, 3+ months)`,
      complete:
        `Perfect! 🚀 I have all the information I need:\n\n📋 Summary:\n• Name: ${data.name}\n• Email: ${data.email}\n• Company: ${data.company}\n• Project: ${data.projectType}\n• Budget: ${data.budget}\n• Timeline: ${data.timeline}\n\nOur team will review your requirements and get back to you within 24 hours! Would you like to schedule a call now?`,
    };
    return questions[step] || "";
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Simulate AI processing delay
    setTimeout(() => {
      let nextStep = currentStep;
      const newUserData = { ...userData };

      // Update user data based on current step
      switch (currentStep) {
        case "name":
          newUserData.name = input.trim();
          nextStep = "email";
          break;
        case "email":
          newUserData.email = input.trim();
          nextStep = "company";
          break;
        case "company":
          newUserData.company = input.trim();
          nextStep = "project";
          break;
        case "project":
          newUserData.projectType = input.trim();
          nextStep = "budget";
          break;
        case "budget":
          newUserData.budget = input.trim();
          nextStep = "timeline";
          break;
        case "timeline":
          newUserData.timeline = input.trim();
          nextStep = "complete";
          break;
        case "complete":
          // Send data to your backend/CRM
          console.log("User data collected:", newUserData);
          break;
      }

      setUserData(newUserData);
      setCurrentStep(nextStep);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: getNextQuestion(nextStep, newUserData),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 800);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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
                <h3 className="font-semibold text-sm">AI Assistant</h3>
                <p className="text-xs text-gray-200">
                  {currentStep === "complete" ? "All set! 🎉" : "Online"}
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
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2 animate-in slide-in-from-bottom-2",
                  message.role === "user" ? "justify-end" : "justify-start",
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
                  <Loader2 className="w-4 h-4 animate-spin text-[#0B3D2E]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {currentStep !== "complete" && (
            <div className="p-4 border-t bg-white rounded-b-lg">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="flex-1 rounded-full border-gray-300 focus:border-[#4ADE80] focus:ring-[#4ADE80]"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="rounded-full bg-[#0B3D2E] hover:bg-[#145C43] text-white flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
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
