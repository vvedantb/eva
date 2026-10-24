"use client";

import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { cn } from "../utils/cn";

type ConfirmationState = "pending" | "accepted" | "rejected";

interface ConfirmationContextValue {
  state: ConfirmationState;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(
  null,
);

const useConfirmation = () => {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error("Confirmation components must be used within Confirmation");
  }
  return context;
};

export type ConfirmationProps = ComponentProps<typeof Alert> & {
  state: ConfirmationState;
};

export const Confirmation = ({
  className,
  state,
  ...props
}: ConfirmationProps) => (
  <ConfirmationContext.Provider value={{ state }}>
    <Alert className={cn("flex flex-col gap-2", className)} {...props} />
  </ConfirmationContext.Provider>
);

export type ConfirmationTitleProps = ComponentProps<typeof AlertDescription>;

export const ConfirmationTitle = ({
  className,
  ...props
}: ConfirmationTitleProps) => (
  <AlertDescription className={cn("inline", className)} {...props} />
);

export const ConfirmationRequest = ({ children }: { children?: ReactNode }) => {
  const { state } = useConfirmation();
  if (state !== "pending") return null;
  return children;
};

export const ConfirmationAccepted = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const { state } = useConfirmation();
  if (state !== "accepted") return null;
  return children;
};

export const ConfirmationRejected = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const { state } = useConfirmation();
  if (state !== "rejected") return null;
  return children;
};

export type ConfirmationActionsProps = ComponentProps<"div">;

export const ConfirmationActions = ({
  className,
  ...props
}: ConfirmationActionsProps) => {
  const { state } = useConfirmation();
  if (state !== "pending") return null;
  return (
    <div
      className={cn("flex items-center justify-end gap-2 self-end", className)}
      {...props}
    />
  );
};

export type ConfirmationActionProps = ComponentProps<typeof Button>;

export const ConfirmationAction = (props: ConfirmationActionProps) => (
  <Button className="h-8 px-3 text-sm" type="button" {...props} />
);
