import React from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import type {
  Action,
  BaseNode,
  ButtonNode,
  Node,
  SpacerNode,
  StackNode,
  Style,
  TextNode,
} from './schema';
import type { RenderContext } from './renderContext';
import { resolveText } from './placeholders';
import { toRNStyle } from './style';

/**
 * Render one schema node into a React Native primitive.
 *
 * An unrecognised `type` renders the node's `fallback` and, failing that,
 * nothing at all — never a throw. That is what lets a document published today
 * run on a build shipped a year ago. See the forward compatibility section of
 * SCHEMA.md.
 */
export const renderNode = (
  node: Node,
  ctx: RenderContext
): React.ReactElement | null => {
  if (!node || typeof node !== 'object') return null;
  if (node.hidden) return null;

  switch (node.type) {
    case 'stack':
      return renderStack(node as StackNode, ctx);
    case 'text':
      return renderText(node as TextNode, ctx);
    case 'button':
      return renderButton(node as ButtonNode, ctx);
    case 'spacer':
      return renderSpacer(node as SpacerNode);
    default:
      return node.fallback ? renderNode(node.fallback, ctx) : null;
  }
};

/* -------------------------------------------------------------------------- */
/* Node renderers                                                              */
/* -------------------------------------------------------------------------- */

const renderStack = (
  node: StackNode,
  ctx: RenderContext
): React.ReactElement => {
  const horizontal = node.direction === 'horizontal';

  const layout: ViewStyle = {
    flexDirection: horizontal ? 'row' : 'column',
    alignItems: mapAlign(node.align),
    justifyContent: mapJustify(node.justify),
    ...(node.gap != null ? { gap: node.gap } : null),
  };

  // Ids and indices are namespaced apart so a child with `id: "0"` cannot
  // collide with the index key of an unidentified sibling.
  const children = node.children.map((child, i) => (
    <React.Fragment key={child.id ? `id:${child.id}` : `i:${i}`}>
      {renderNode(child, ctx)}
    </React.Fragment>
  ));

  // A vertical scrollable stack becomes a ScrollView: layout and padding live on
  // `contentContainerStyle`, while `style` only sizes the scroll viewport.
  if (node.scrollable && !horizontal) {
    const { flex, ...boxStyle } = (node.style ?? {}) as Style;
    return (
      <ScrollView
        style={{ flex: flex ?? 1 }}
        contentContainerStyle={[{ flexGrow: 1 }, layout, toRNStyle(boxStyle)]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[layout, toRNStyle(node.style)]}>{children}</View>;
};

const renderText = (node: TextNode, ctx: RenderContext): React.ReactElement => {
  const content = resolveText(node.text, ctx);
  const action = node.action;
  const onPress = action ? () => ctx.onAction(action) : undefined;

  return (
    <Text
      style={toRNStyle(node.style)}
      numberOfLines={node.numberOfLines}
      onPress={onPress}
      suppressHighlighting={!action}
      accessibilityRole={action ? roleForAction(action) : undefined}
      accessibilityLabel={spokenLabel(node, ctx)}
    >
      {content}
    </Text>
  );
};

const renderButton = (
  node: ButtonNode,
  ctx: RenderContext
): React.ReactElement => {
  const label = resolveText(node.label, ctx);
  const disabled = !!ctx.busy;

  return (
    <Pressable
      disabled={disabled}
      onPress={() => ctx.onAction(node.action)}
      accessibilityRole="button"
      // Stated rather than left to Pressable's own mapping: a purchase button
      // that stops responding mid-flight has to announce why, not just dim.
      accessibilityState={{ disabled }}
      accessibilityLabel={spokenLabel(node, ctx)}
      style={({ pressed }) => [
        toRNStyle(node.style),
        pressed && toRNStyle(node.pressedStyle),
        disabled && toRNStyle(node.disabledStyle),
      ]}
    >
      <Text style={toRNStyle(node.labelStyle)}>{label}</Text>
    </Pressable>
  );
};

const renderSpacer = (node: SpacerNode): React.ReactElement => {
  // `flex` absorbs the room left over (and wins over `size`); `size` is a fixed
  // gap. Setting both width and height covers vertical and horizontal stacks.
  const style: ViewStyle =
    node.flex != null
      ? { flex: node.flex }
      : { width: node.size ?? 0, height: node.size ?? 0 };

  return <View style={style} />;
};

/* -------------------------------------------------------------------------- */
/* Accessibility                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Undefined unless the author wrote a label, because React Native already
 * derives one from the rendered text. It exists for the case where that
 * derived label is not a sentence: `"Try free for {{package.trialLength}}"`
 * degrades to "Try free for " when the store returns no trial.
 */
const spokenLabel = (node: BaseNode, ctx: RenderContext): string | undefined =>
  node.accessibilityLabel == null
    ? undefined
    : resolveText(node.accessibilityLabel, ctx);

/**
 * Only `openURL` leaves the app, so only `openURL` is a link. "Restore" reads
 * as a link in most paywalls but behaves as a button, and announcing it as a
 * link tells a screen-reader user to expect a page they will never get.
 */
const roleForAction = (action: Action): 'link' | 'button' =>
  action.type === 'openURL' ? 'link' : 'button';

/* -------------------------------------------------------------------------- */
/* Style mapping                                                               */
/* -------------------------------------------------------------------------- */

const mapAlign = (align: StackNode['align']): ViewStyle['alignItems'] => {
  switch (align) {
    case 'start':
      return 'flex-start';
    case 'end':
      return 'flex-end';
    case 'center':
      return 'center';
    case 'stretch':
      return 'stretch';
    default:
      return undefined;
  }
};

const mapJustify = (
  justify: StackNode['justify']
): ViewStyle['justifyContent'] => {
  switch (justify) {
    case 'start':
      return 'flex-start';
    case 'end':
      return 'flex-end';
    case 'center':
      return 'center';
    case 'space-between':
      return 'space-between';
    default:
      return undefined;
  }
};
