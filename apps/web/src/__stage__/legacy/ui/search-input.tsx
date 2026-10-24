import { IconSearch } from "@tabler/icons-react";
import { ClearInput, type ClearInputProps } from "./clear-input";
import { cn } from "../utils/cn";

interface SearchInputProps extends Omit<
  ClearInputProps,
  "value" | "onChange" | "leading" | "wrapperClassName"
> {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = "Search...",
  className,
  inputClassName,
  ...props
}: SearchInputProps) {
  return (
    <ClearInput
      value={value}
      onChange={(next) => {
        onChange(next);
        if (next.length === 0) {
          onClear();
        }
      }}
      placeholder={placeholder}
      wrapperClassName={cn("w-full max-w-sm", className)}
      className={cn("h-9 pl-8 text-base sm:text-sm", inputClassName)}
      leading={
        <IconSearch
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 z-3 -translate-y-1/2 text-muted-foreground"
        />
      }
      {...props}
    />
  );
}

export { SearchInput };
export type { SearchInputProps };
