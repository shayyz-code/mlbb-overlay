import { useEffect, useRef, useState } from "react";

export function parseTickerMessages(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function TickerMessagesInput({
  messages,
  onChange,
}: {
  messages: string[];
  onChange: (messages: string[]) => void;
}) {
  const messagesValue = messages.join("\n");
  const [inputValue, setInputValue] = useState(messagesValue);
  const pendingValue = useRef(messagesValue);

  useEffect(() => {
    if (messagesValue === pendingValue.current) return;
    pendingValue.current = messagesValue;
    setInputValue(messagesValue);
  }, [messagesValue]);

  return (
    <textarea
      id="ticker-messages"
      rows={5}
      value={inputValue}
      onChange={(event) => {
        const nextInputValue = event.target.value;
        const nextMessages = parseTickerMessages(nextInputValue);
        const nextMessagesValue = nextMessages.join("\n");
        setInputValue(nextInputValue);
        pendingValue.current = nextMessagesValue;
        if (nextMessagesValue !== messagesValue) onChange(nextMessages);
      }}
    />
  );
}
