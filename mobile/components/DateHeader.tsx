import { useState } from 'react';
import { StyleSheet, View, Pressable, Platform, Modal } from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDateStore, todayString } from '@/stores/dateStore';

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function DateHeader() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { selectedDate, setDate, goToPreviousDay, goToNextDay } =
    useDateStore();
  const [showPicker, setShowPicker] = useState(false);

  const isToday = selectedDate === todayString();

  const handlePrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goToPreviousDay();
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goToNextDay();
  };

  const handleDateChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (date) {
      setDate(toDateString(date));
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, { borderBottomColor: colors.borderLight }]}>
        <Pressable
          onPress={handlePrev}
          hitSlop={12}
          style={styles.arrowBtn}
        >
          <MaterialIcons name="chevron-left" size={28} color={colors.tint} />
        </Pressable>

        <Pressable
          onPress={() => setShowPicker(true)}
          style={styles.dateBtn}
        >
          <ThemedText style={[Typography.headline, { color: colors.text }]}>
            {isToday ? 'Today' : formatDisplayDate(selectedDate)}
          </ThemedText>
          {isToday && (
            <ThemedText
              style={[Typography.caption1, { color: colors.textSecondary }]}
            >
              {formatDisplayDate(selectedDate)}
            </ThemedText>
          )}
        </Pressable>

        <Pressable
          onPress={handleNext}
          hitSlop={12}
          style={styles.arrowBtn}
        >
          <MaterialIcons name="chevron-right" size={28} color={colors.tint} />
        </Pressable>
      </View>

      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={new Date(selectedDate + 'T12:00:00')}
          mode="date"
          onChange={handleDateChange}
        />
      )}

      {showPicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View
              style={[styles.pickerCard, { backgroundColor: colors.surface }]}
            >
              <DateTimePicker
                value={new Date(selectedDate + 'T12:00:00')}
                mode="date"
                display="inline"
                onChange={handleDateChange}
                themeVariant={colorScheme === 'dark' ? 'dark' : 'light'}
              />
              <Pressable
                style={[styles.doneBtn, { backgroundColor: colors.tint }]}
                onPress={() => setShowPicker(false)}
              >
                <ThemedText style={[Typography.headline, { color: '#FFFFFF' }]}>
                  Done
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  arrowBtn: {
    padding: Spacing.xs,
  },
  dateBtn: {
    alignItems: 'center',
    gap: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerCard: {
    borderRadius: 16,
    padding: Spacing.lg,
    width: '90%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  doneBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 12,
    marginTop: Spacing.md,
  },
});
