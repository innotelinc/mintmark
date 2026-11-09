// A phone photo is several megabytes and the model does not need that. The
// camera or library gives a file URI; this renders JPEG data URLs at the sizes
// the Worker accepts (photo < 2 MB, thumbnail < 200 KB).
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

export type PreparedPhoto = { image: string; thumb: string }

const bytesOf = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4)

type Rendered = { base64?: string | null }

/**
 * expo-image-manipulator moved to a context API; older builds still export
 * `manipulateAsync`. Support both so a dependency bump cannot break capture.
 */
async function renderJpeg(uri: string, width: number, compress: number): Promise<string> {
  const legacy = (ImageManipulator as unknown as { manipulateAsync?: (uri: string, actions: { resize: { width: number } }[], options: object) => Promise<Rendered> }).manipulateAsync
  let result: Rendered
  if (legacy) {
    result = await legacy(uri, [{ resize: { width } }], { compress, format: 'jpeg', base64: true })
  } else {
    const mod = ImageManipulator as unknown as {
      ImageManipulator: { manipulate: (u: string) => { resize: (size: { width: number }) => { renderAsync: () => Promise<{ saveAsync: (o: object) => Promise<Rendered> }> } } }
      SaveFormat: { JPEG: string }
    }
    const image = await mod.ImageManipulator.manipulate(uri).resize({ width }).renderAsync()
    result = await image.saveAsync({ compress, format: mod.SaveFormat.JPEG, base64: true })
  }
  if (!result?.base64) throw new Error('That photo could not be processed.')
  return `data:image/jpeg;base64,${result.base64}`
}

export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    throw new Error(
      source === 'camera'
        ? 'Camera access is off for Mintmark. Turn it on in the iOS Settings app.'
        : 'Photo access is off for Mintmark. Turn it on in the iOS Settings app.',
    )
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false })
  if (result.canceled || !result.assets?.length) return null
  return result.assets[0].uri
}

export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  let image = await renderJpeg(uri, 1280, 0.85)
  if (bytesOf(image) > 1_800_000) image = await renderJpeg(uri, 1280, 0.65)
  if (bytesOf(image) > 1_900_000) image = await renderJpeg(uri, 1024, 0.6)
  const thumb = await renderJpeg(uri, 320, 0.7)
  return { image, thumb }
}
