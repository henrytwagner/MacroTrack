import React, { useState } from 'react';
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

function formatMinimalDate(dateStr: string, isToday: boolean): { overline: string; date: string } {
  const d = new Date(dateStr + 'T12:00:00');
  const overline = isToday
    ? 'Today'
    : d.toLocaleDateString('en-US', { weekday: 'long' });
  const date = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
  return { overline, date };
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface DateHeaderProps {
  rightAction?: React.ReactNode;
  showArrows?: boolean;
  alignDate?: 'left' | 'center';
}

export default function DateHeader({
  rightAction,
  showArrows = true,
  alignDate = 'center',
}: DateHeaderProps = {}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { selectedDate, setDate, goToPreviousDay, goToNextDay } =
    useDateStore();
  const [showPicker, setShowPicker] = useState(false);

  const isToday = selectedDate === todayString();
  const isMinimal = !showArrows && alignDate === 'left';
  const minimalParts = isMinimal ? formatMinimalDate(selectedDate, isToday) : null;

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
      <View
        style={[
          styles.container,
          { borderBottomColor: colors.borderLight },
          isMinimal && styles.containerMinimal,
        ]}
      >
        <View
          style={[
            styles.dateRow,
            alignDate === 'left' && styles.dateRowLeft,
            !showArrows && styles.dateRowNoArrows,
          ]}
        >
          {showArrows && (
            <Pressable
              onPress={handlePrev}
              hitSlop={12}
              style={styles.arrowBtn}
            >
              <MaterialIcons name="chevron-left" size={22} color={colors.tint} />
            </Pressable>
          )}

          <Pressable
            onPress={() => setShowPicker(true)}
            style={[
              styles.dateBtn,
              alignDate === 'left' && styles.dateBtnLeft,
              isMinimal && styles.dateBtnMinimal,
            ]}
          >
            {minimalParts ? (
              <>
                <ThemedText
                  style={[
                    styles.minimalOverline,
                    { color: colors.textTertiary },
                  ]}
                >
                  {minimalParts.overline}
                </ThemedText>
                <ThemedText
                  style={[styles.minimalDate, { color: colors.text }]}
                >
                  {minimalParts.date}
                </ThemedText>
              </>
            ) : (
              <>
                <ThemedText style={[Typography.title3, { color: colors.text }]}>
                  {isToday ? 'Today' : formatDisplayDate(selectedDate)}
                </ThemedText>
                {isToday && (
                  <ThemedText
                    style={[Typography.caption1, { color: colors.textSecondary }]}
                  >
                    {formatDisplayDate(selectedDate)}
                  </ThemedText>
                )}
              </>
            )}
          </Pressable>

          {showArrows && (
            <Pressable
              onPress={handleNext}
              hitSlop={12}
              style={styles.arrowBtn}
            >
              <MaterialIcons name="chevron-right" size={22} color={colors.tint} />
            </Pressable>
          )}
        </View>

        {rightAction != null && (
          <View style={styles.rightAction}>{rightAction}</View>
        )}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  containerMinimal: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0,
  },
  dateRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRowLeft: {
    justifyContent: 'flex-start',
  },
  dateRowNoArrows: {
    justifyContent: 'flex-start',
  },
  arrowBtn: {
    padding: Spacing.xs,
  },
  dateBtn: {
    alignItems: 'center',
    gap: 2,
  },
  dateBtnLeft: {
    alignItems: 'flex-start',
  },
  dateBtnMinimal: {
    gap: 4,
  },
  minimalOverline: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  minimalDate: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  rightAction: {
    marginLeft: Spacing.md,
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
