export interface ExtensionTotal {
  extension: string;
  total_bytes: number;
}

export interface CategoryTotal {
  category: string;
  total_bytes: number;
  extensions: ExtensionTotal[];
}

export interface FileTypes {
  total_bytes: number;
  categories: CategoryTotal[];
}
