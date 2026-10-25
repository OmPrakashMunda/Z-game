import { CATEGORIES, type ItemDef } from '../data/items';
import { isStructure } from '../data/structures';
import { requestThumbnail } from '../render/thumbnails';
import { icon } from './icons';

/**
 * A product picture. Structures get a picture of their real 3D model. Supplies get a coloured tile with their icon,
 * since they have no model.
 */
export function productImage(item: ItemDef, width = 64): HTMLElement {
  const height = Math.round((width * 3) / 4);
  const box = document.createElement('div');
  box.className = 'thumb';
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;

  if (!isStructure(item.id)) {
    const color = CATEGORIES[item.category].color;
    box.classList.add('tile');
    box.style.background = `linear-gradient(145deg, ${color}, ${color}99)`;
    box.append(icon(item.icon, Math.round(width * 0.45)));
    return box;
  }

  box.classList.add('loading');
  const img = document.createElement('img');
  img.alt = item.name;
  img.draggable = false;
  box.append(img);
  requestThumbnail(item.id, (url) => {
    if (url) {
      img.src = url;
      box.classList.remove('loading');
    } else {
      // No picture available: fall back to the icon tile
      box.classList.remove('loading');
      box.classList.add('tile');
      box.style.background = `linear-gradient(145deg, ${CATEGORIES[item.category].color}, ${CATEGORIES[item.category].color}99)`;
      img.remove();
      box.append(icon(item.icon, Math.round(width * 0.45)));
    }
  });
  return box;
}
