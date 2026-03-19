import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import type { CustomFood } from '@shared/types';

import CustomFoodList from '@/components/CustomFoodList';
import CreateFoodSheet from '@/components/CreateFoodSheet';

export default function ManageCustomFoodsScreen() {
  const router = useRouter();
  const [editingFood, setEditingFood] = useState<CustomFood | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CustomFoodList
        visible={true}
        onClose={() => router.back()}
        onEditFood={(food) => setEditingFood(food)}
        refreshKey={refreshKey}
      />
      <CreateFoodSheet
        visible={!!editingFood}
        editingFood={editingFood ?? undefined}
        onDismiss={() => setEditingFood(null)}
        onSaved={() => {
          setRefreshKey((k) => k + 1);
          setEditingFood(null);
        }}
        onDeleted={() => {
          setRefreshKey((k) => k + 1);
          setEditingFood(null);
        }}
      />
    </>
  );
}
