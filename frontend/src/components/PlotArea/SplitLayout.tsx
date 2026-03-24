import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { LayoutNode } from '../../types'
import PlotPanel from './PlotPanel'

interface Props {
  node: LayoutNode
}

export default function SplitLayout({ node }: Props) {
  if (node.type === 'plot') {
    return <PlotPanel node={node} />
  }

  // react-resizable-panels: "horizontal" = left-right, "vertical" = top-bottom
  // Our model: "vertical" = top-bottom split, "horizontal" = left-right split
  const direction = node.direction === 'horizontal' ? 'horizontal' : 'vertical'

  return (
    <PanelGroup direction={direction}>
      <Panel minSize={10}>
        <SplitLayout node={node.children[0]} />
      </Panel>
      <PanelResizeHandle className="resize-handle" />
      <Panel minSize={10}>
        <SplitLayout node={node.children[1]} />
      </Panel>
    </PanelGroup>
  )
}
