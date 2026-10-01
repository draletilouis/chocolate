import { redirect } from 'next/navigation';

/** The lot list is now the Store; old links land there */
export default function MaterialsIndex() {
  redirect('/store');
}
