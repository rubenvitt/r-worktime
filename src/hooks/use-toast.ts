import { toast } from "sonner";

export const useToast = () => {
  return {
    toast: ({
      title,
      description,
      variant = "default",
      ...props
    }: {
      title?: string;
      description?: string;
      variant?: "default" | "destructive";
    }) => {
      const message = title || description || "";

      if (variant === "destructive") {
        toast.error(message, {
          description: title && description ? description : undefined,
          ...props,
        });
      } else {
        toast.success(message, {
          description: title && description ? description : undefined,
          ...props,
        });
      }
    },
  };
};
