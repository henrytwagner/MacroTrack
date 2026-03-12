import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Edit entry is merged with the add-food flow. This route redirects to
 * add-food with editEntryId so the same FoodDetailSheet is used for add and edit.
 */
export default function EditEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (id) {
      router.replace({ pathname: '/add-food', params: { editEntryId: id } });
    } else if (router.canGoBack()) {
      router.back();
    }
  }, [id, router]);

  return null;
}
