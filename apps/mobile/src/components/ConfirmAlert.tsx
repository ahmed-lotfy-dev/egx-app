import React, { useState, useRef, useCallback } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { colors } from "@/constants/theme";

interface AlertButton {
  text: string;
  onPress: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
  onClose: () => void;
}

export function ConfirmAlert({
  visible,
  title,
  message,
  buttons,
  onClose,
}: AlertProps) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <Modal visible={true} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="w-[90%] max-w-[320px] rounded-2xl border border-border bg-surface p-6">
          <Text className="font-display text-[18px] text-text mb-2">{title}</Text>
          <Text className="font-body text-[14px] leading-6 text-text-secondary mb-6">{message}</Text>

          <View className="flex-row gap-3">
            {buttons.map((button, index) => (
              <Pressable
                key={index}
                accessibilityRole="button"
                onPress={() => {
                  button.onPress();
                  onClose();
                }}
                className={`flex-1 items-center justify-center rounded-xl px-4 py-3 ${
                  button.style === "destructive"
                    ? "bg-down/20 border border-down"
                    : button.style === "cancel"
                    ? "bg-surface-elevated border border-border"
                    : "bg-gold"
                } active:opacity-80`}
              >
                <Text className={`font-title text-[14px] ${
                  button.style === "destructive"
                    ? "text-down"
                    : button.style === "cancel"
                    ? "text-text"
                    : "text-canvas"
                }`}>
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function useConfirm() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [buttons, setButtons] = useState<AlertButton[]>([]);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  function confirmFn(
    options: { title: string; message: string; confirmText?: string; cancelText?: string; destructive?: boolean }
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      setTitle(options.title);
      setMessage(options.message);
      setButtons([
        {
          text: options.cancelText || "إلغاء",
          onPress: () => resolve(false),
          style: "cancel",
        },
        {
          text: options.confirmText || (options.destructive ? "حذف" : "تأكيد"),
          onPress: () => resolve(true),
          style: options.destructive ? "destructive" : "default",
        },
      ]);
      resolveRef.current = resolve;
      setVisible(true);
    });
  }

  function alertFn(
    options: { title: string; message: string; okText?: string }
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      setTitle(options.title);
      setMessage(options.message);
      setButtons([
        {
          text: options.okText || "تم",
          onPress: () => resolve(),
          style: "default",
        },
      ]);
      setVisible(true);
    });
  }

  const confirm = useCallback(confirmFn, []);
  const alert = useCallback(alertFn, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return { visible, title, message, buttons, onClose: handleClose, confirm, alert };
}