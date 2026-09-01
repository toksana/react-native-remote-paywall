import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import type {
  Action,
  BaseNode,
  ButtonNode,
  DividerNode,
  ImageNode,
  Node,
  PackageDefinition,
  PackageListNode,
  SpacerNode,
  StackNode,
  Style,
  TextNode,
} from './schema';
import type { RenderContext } from './renderContext';
import { resolveText, resolvePlaceholders } from './placeholders';
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
    case 'image':
      return renderImage(node as ImageNode, ctx);
    case 'divider':
      return renderDivider(node as DividerNode);
    case 'packageList':
      return renderPackageList(node as PackageListNode, ctx);
    default: {
      // `Node` is a closed, discriminated union, so the type checker treats the
      // 7 cases above as exhaustive — but a document fetched at runtime can
      // carry an unrecognised `type` the type system never sees. Cast back to
      // the shared base to reach `fallback` for that case.
      const fallback = (node as BaseNode).fallback;
      return fallback ? renderNode(fallback, ctx) : null;
    }
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

const renderImage = (
  node: ImageNode,
  ctx: RenderContext
): React.ReactElement => {
  // Hero art on a paywall carries nothing a screen reader needs, and
  // announcing an unlabelled graphic is worse than passing over it. A label
  // is the author saying this one is different, so it is also the switch.
  const label = spokenLabel(node, ctx);

  return (
    <Image
      source={{ uri: node.source.uri }}
      resizeMode={node.resizeMode ?? 'cover'}
      style={toRNStyle(node.style)}
      accessible={label != null}
      accessibilityRole={label != null ? 'image' : undefined}
      accessibilityLabel={label}
    />
  );
};

const renderDivider = (node: DividerNode): React.ReactElement => (
  <View
    style={[
      {
        height: node.thickness ?? StyleSheet.hairlineWidth,
        backgroundColor: node.color ?? '#00000022',
      },
      toRNStyle(node.style),
    ]}
  />
);

const renderPackageList = (
  node: PackageListNode,
  ctx: RenderContext
): React.ReactElement => {
  const horizontal = node.direction === 'horizontal';
  const rows = resolvePackages(node.packageIds, ctx.packages);

  const layout: ViewStyle = {
    flexDirection: horizontal ? 'row' : 'column',
    ...(node.gap != null ? { gap: node.gap } : null),
  };

  return (
    <View style={layout}>
      {rows.map((pkg) => (
        <PackageRow key={pkg.id} node={node} pkg={pkg} ctx={ctx} />
      ))}
    </View>
  );
};

const resolvePackages = (
  packageIds: string[] | undefined,
  packages: PackageDefinition[]
): PackageDefinition[] => {
  if (!packageIds) return packages;
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  return packageIds
    .map((id) => byId.get(id))
    .filter((pkg): pkg is PackageDefinition => pkg != null);
};

const PackageRow = ({
  node,
  pkg,
  ctx,
}: {
  node: PackageListNode;
  pkg: PackageDefinition;
  ctx: RenderContext;
}): React.ReactElement => {
  const selected = pkg.id === ctx.selectedPackageId;
  const product = ctx.products[pkg.productId];
  // Each row resolves placeholders against its own package, never the
  // currently-selected one — `resolveText` would show every row's price as
  // whatever package is selected elsewhere on the screen.
  const title = resolvePlaceholders(pkg.title, pkg, product);
  const subtitle = pkg.subtitle
    ? resolvePlaceholders(pkg.subtitle, pkg, product)
    : undefined;
  const badge = pkg.badge
    ? resolvePlaceholders(pkg.badge, pkg, product)
    : undefined;

  return (
    <Pressable
      onPress={() => ctx.onSelectPackage(pkg.id)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        toRNStyle(node.itemStyle),
        selected && toRNStyle(node.selectedItemStyle),
      ]}
    >
      <Text style={toRNStyle(node.titleStyle)}>{title}</Text>
      {subtitle != null && (
        <Text style={toRNStyle(node.subtitleStyle)}>{subtitle}</Text>
      )}
      {badge != null && (
        <View style={toRNStyle(node.badgeStyle)}>
          <Text style={toRNStyle(node.badgeTextStyle)}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
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
