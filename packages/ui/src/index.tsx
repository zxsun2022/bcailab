import * as React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`btn btn-${variant} btn-${size} ${className ?? ""}`.trim()}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return <input ref={ref} className={`input ${className ?? ""}`.trim()} {...props} />;
});
Input.displayName = "Input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return <textarea ref={ref} className={`textarea ${className ?? ""}`.trim()} {...props} />;
  }
);
Textarea.displayName = "Textarea";

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => {
  return <div className={`card ${className ?? ""}`.trim()} {...props} />;
};

export const Badge: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ className, ...props }) => {
  return <span className={`badge ${className ?? ""}`.trim()} {...props} />;
};
