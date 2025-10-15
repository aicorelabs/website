"use client";

import {
    type ComponentProps,
    forwardRef,
    type MouseEvent,
    useCallback,
} from "react";
import { Button } from "@/components/ui/button";

interface ChatTriggerButtonProps extends ComponentProps<typeof Button> {
    prompt?: string;
}

export const ChatTriggerButton = forwardRef<
    HTMLButtonElement,
    ChatTriggerButtonProps
>(
    ({ prompt, onClick, ...props }, ref) => {
        const handleClick = useCallback(
            (event: MouseEvent<HTMLButtonElement>) => {
                onClick?.(event);
                if (event.defaultPrevented) {
                    return;
                }

                window.dispatchEvent(
                    new CustomEvent("ai-chat:open", {
                        detail: prompt ? { prompt } : {},
                    }),
                );
            },
            [onClick, prompt],
        );

        return <Button ref={ref} {...props} onClick={handleClick} />;
    },
);

ChatTriggerButton.displayName = "ChatTriggerButton";
