import * as React from "react";
import type { TextareaProps } from "@bcailab/ui";
import { Textarea } from "@bcailab/ui";

const setRef = <T,>(ref: React.ForwardedRef<T>, value: T | null) => {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
};

export const AutosizeTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onInput, value, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const resize = React.useCallback(() => {
      if (!innerRef.current) return;
      innerRef.current.style.height = "auto";
      innerRef.current.style.height = `${innerRef.current.scrollHeight}px`;
    }, []);

    React.useEffect(() => {
      resize();
    }, [resize, value]);

    return (
      <Textarea
        {...props}
        value={value}
        ref={(node) => {
          innerRef.current = node;
          setRef(ref, node);
        }}
        className={`textarea-autosize ${className ?? ""}`.trim()}
        onInput={(event) => {
          resize();
          onInput?.(event);
        }}
      />
    );
  }
);

AutosizeTextarea.displayName = "AutosizeTextarea";
