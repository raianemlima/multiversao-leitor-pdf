/**
 * Modelo apenas em memória. Não existe banco, conta, API ou persistência.
 * Coordenadas são frações da página, para acompanhar zoom e redimensionamento.
 *
 * @typedef {{x:number,y:number}} Point
 * @typedef {{id:string,type:'highlight',x:number,y:number,w:number,h:number,color:string}} Highlight
 * @typedef {{id:string,type:'pen',points:Point[],color:string,width:number}} Pen
 * @typedef {{id:string,type:'note',x:number,y:number,text:string,color:string}} Note
 * @typedef {Highlight|Pen|Note} Annotation
 * @typedef {{items:Annotation[],undo:Annotation[][],redo:Annotation[][]}} PageAnnotations
 */

export const MODES = ['read', 'highlight', 'pen', 'note', 'eraser'];
export const COLORS = {
  yellow: { label: 'Amarelo', highlight: '#f2cf49', ink: '#9b6508' },
  green: { label: 'Verde', highlight: '#78c39f', ink: '#23704e' },
  pink: { label: 'Rosa', highlight: '#ef9ba8', ink: '#a03d59' },
  blue: { label: 'Azul', highlight: '#91b9ea', ink: '#244f87' }
};

export function createState() {
  return {
    document: null,
    fileName: '',
    fileSize: 0,
    page: 1,
    mode: 'read',
    color: 'yellow',
    penWidth: 2.5,
    zoom: 1,
    pages: new Map(),
    loading: false,
    rendering: false,
    draft: null
  };
}

export function pageAnnotations(state, page = state.page) {
  if (!state.pages.has(page)) {
    state.pages.set(page, { items: [], undo: [], redo: [] });
  }
  return state.pages.get(page);
}
