import type * as ReactTypes from 'react';

declare global {
  namespace JSX {
    interface Element extends ReactTypes.JSX.Element {}
    interface ElementClass extends ReactTypes.JSX.ElementClass {}
    interface IntrinsicElements extends ReactTypes.JSX.IntrinsicElements {}

    type ElementType = ReactTypes.JSX.ElementType;
    interface IntrinsicAttributes extends ReactTypes.JSX.IntrinsicAttributes {}
    interface ElementAttributesProperty extends ReactTypes.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends ReactTypes.JSX.ElementChildrenAttribute {}
  }
}
