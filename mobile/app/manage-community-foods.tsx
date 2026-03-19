import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import type { CommunityFood } from '@shared/types';

import CommunityFoodList from '@/components/CommunityFoodList';
import CreateFoodSheet from '@/components/CreateFoodSheet';

export default function ManageCommunityFoodsScreen() {
  const router = useRouter();
  const [editingFood, setEditingFood] = useState<CommunityFood | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CommunityFoodList
        visible={true}
        onClose={() => router.back()}
        onEditFood={(food) => setEditingFood(food)}
        refreshKey={refreshKey}
      />
      <CreateFoodSheet
        visible={!!editingFood}
        editingCommunityFood={editingFood ?? undefined}
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
