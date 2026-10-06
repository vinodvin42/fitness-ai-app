import React, { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { QuoteServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Chip } from "../../components/Chip";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/Toast";
import { createQuoteRequest } from "../../api/coachSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "RequestQuote">;

const SERVICES: Array<{ value: QuoteServiceType; label: string }> = [
  { value: "fitness", label: "Fitness" },
  { value: "nutrition", label: "Nutrition" },
  { value: "combined", label: "Combined" },
];

/** Ask a coach for a custom quote (POST /coaching/quote-requests). Also used for "Request again". */
export function RequestQuoteScreen({ navigation, route }: Props) {
  const { professionalId, professionalName, serviceType: initialService, message: initialMessage } = route.params;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serviceType, setServiceType] = useState<QuoteServiceType>(initialService ?? "fitness");
  const [message, setMessage] = useState(initialMessage ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => createQuoteRequest({ professionalId, serviceType, message: message.trim() }),
    onSuccess: (q) => {
      queryClient.invalidateQueries({ queryKey: ["coaching", "quoteRequests"] });
      toast.show("Quote requested", "success");
      navigation.replace("QuoteDetail", { quoteId: q.id });
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't send that request."), "error"),
  });

  const onSubmit = () => {
    if (message.trim().length < 10) {
      setError("Tell the coach a little about your goals (at least 10 characters).");
      return;
    }
    setError(null);
    submit.mutate();
  };

  return (
    <ScreenContainer title="Request a Quote" subtitle={professionalName ? `For ${professionalName}` : undefined}>
      <BackButton onPress={() => navigation.goBack()} />
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>What do you need?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {SERVICES.map((s) => (
            <Chip key={s.value} label={s.label} selected={serviceType === s.value} onPress={() => setServiceType(s.value)} />
          ))}
        </View>
        <TextField
          label="Your message"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={1000}
          placeholder="Your goals, schedule and anything the coach should know"
          error={error}
        />
      </Card>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        The coach replies with a price and a note. There's no payment until you accept and book a session.
      </Text>
      <Button label="Send request" onPress={onSubmit} loading={submit.isPending} />
    </ScreenContainer>
  );
}
