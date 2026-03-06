import * as React from "react";

type LocalDateTimeProps = {
  value: string;
  className?: string;
  options?: Intl.DateTimeFormatOptions;
  titleOptions?: Intl.DateTimeFormatOptions;
};

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
};

const DEFAULT_TITLE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short"
};

const formatLocalDateTime = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, options).format(new Date(value));

export function LocalDateTime(props: LocalDateTimeProps) {
  const {
    value,
    className,
    options = DEFAULT_OPTIONS,
    titleOptions = DEFAULT_TITLE_OPTIONS
  } = props;

  const displayText =
    typeof window === "undefined" ? "" : formatLocalDateTime(value, options);
  const fullText =
    typeof window === "undefined" ? undefined : formatLocalDateTime(value, titleOptions);

  return (
    <time dateTime={value} className={className} title={fullText} suppressHydrationWarning>
      {displayText}
    </time>
  );
}
