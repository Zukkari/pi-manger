const BASE_URL = '/api';

export const apiClient = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, options);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};
