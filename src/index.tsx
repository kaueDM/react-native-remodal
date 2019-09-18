import cuid from 'cuid';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, TouchableWithoutFeedback, ViewStyle } from 'react-native';
import Animated, { Easing } from 'react-native-reanimated';

interface IReModalContext {
    setView: (key: string, view: React.ReactElement<any> | undefined) => void;
    setConfig: (key: string, config: any) => void;
    setVisible: (key: string, visible: boolean) => void;
}

const ReModalContext = React.createContext<IReModalContext>({} as any);

const { Value, block, timing, cond, stopClock, and, eq, neq, set, startClock, Clock, interpolate, Extrapolate, call } = Animated;

export enum State {
    BEGAN,
    END,
}

const runOpacityTimer = (gestureState: Animated.Adaptable<number>, onModalShow?: () => void, onModalHide?: () => void) => {
    const clock = new Clock();
    const state = {
        finished: new Value(0),
        position: new Value(0),
        time: new Value(0),
        frameTime: new Value(0),
    };

    const config = {
        duration: Platform.OS === 'ios' ? 300 : 240,
        toValue: new Value(-1),
        easing: Easing.inOut(Easing.ease),
    };

    return block([
        cond(and(eq(gestureState, State.BEGAN), neq(config.toValue, 1)), [
            set(state.finished, 0),
            set(state.time, 0),
            set(state.frameTime, 0),
            set(config.toValue, 1),
            startClock(clock),
        ]),
        cond(and(eq(gestureState, State.END), neq(config.toValue, 0)), [
            set(state.finished, 0),
            set(state.time, 0),
            set(state.frameTime, 0),
            set(config.toValue, 0),
            startClock(clock),
        ]),
        timing(clock, state, config),
        cond(state.finished, stopClock(clock)),
        onModalShow && cond(and(state.finished, eq(gestureState, State.BEGAN)), call([], onModalShow)),
        onModalHide && cond(and(state.finished, eq(gestureState, State.END)), call([], onModalHide)),
        interpolate(state.position, {
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: Extrapolate.CLAMP,
        }),
    ]);
};

function defaultModalAnimationStyle(gestureState: Animated.Adaptable<number>, opacity: Animated.Adaptable<number>) {
    const opacityIn = cond(
        eq(gestureState, State.BEGAN),
        interpolate(opacity, {
            inputRange: Platform.OS === 'ios' ? [0, 0.2, 1] : [0, 1],
            outputRange: Platform.OS === 'ios' ? [0, 1, 1] : [0, 1],
            extrapolate: Extrapolate.CLAMP,
        }),
        opacity,
    );

    const scaleIn = cond(
        eq(gestureState, State.BEGAN),
        interpolate(opacity, {
            inputRange: [0, 1],
            outputRange: [Platform.OS === 'android' ? 0.8 : 1.2, 1],
            extrapolate: Extrapolate.CLAMP,
        }),
        1,
    );

    return { opacity: opacityIn, transform: [{ scale: scaleIn }, { perspective: 200 }] };
}

function Modal({
    children,
    onCancel,
    isVisible,
    viewStyleFnc,
    onModalShow,
    onModalHide,
    containerStyle,
    keyboardAvoiding = true,
    keyboardVerticalOffset,
}: {
    children: any;
    onCancel?: () => void;
    isVisible: boolean;
    viewStyleFnc: Required<IReModalProps>['modalAnimationFunction'];
    onModalShow?: () => void;
    onModalHide?: () => void;
    containerStyle?: ViewStyle;
    keyboardAvoiding?: boolean;
    keyboardVerticalOffset?: number;
}) {
    const modalLayout = useRef({ width: new Value<number>(-1), height: new Value<number>(-1) });
    const { current: animationState } = useRef(new Value<number>(-1));
    const { current: opacity } = useRef(runOpacityTimer(animationState, onModalShow, onModalHide));
    const { current: viewStyle } = useRef(viewStyleFnc(animationState, opacity as Animated.Adaptable<number>, modalLayout.current));
    const init = useRef(false);

    useEffect(() => {
        if (init.current) {
            animationState.setValue(isVisible ? State.BEGAN : State.END);
        }
        init.current = true;
    }, [isVisible]);

    return (
        <KeyboardAvoidingView
            behavior="height"
            enabled={keyboardAvoiding}
            keyboardVerticalOffset={keyboardVerticalOffset}
            style={[styles.container, containerStyle]}
            pointerEvents={isVisible ? 'auto' : 'none'}
        >
            <TouchableWithoutFeedback onPress={onCancel}>
                <Animated.View style={[styles.backdrop, { opacity }]} />
            </TouchableWithoutFeedback>
            <SafeAreaView>
                <Animated.View
                    onLayout={(event) => {
                        modalLayout.current.height.setValue(event.nativeEvent.layout.height);
                        modalLayout.current.width.setValue(event.nativeEvent.layout.width);
                    }}
                    style={viewStyle}
                >
                    {children}
                </Animated.View>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}

export function ReModalProvider({ children }: { children: React.ReactNode }) {
    const [views, setViews] = useState<{ [key: string]: React.ReactElement<any> | undefined }>({});
    const visibleView = useRef<{ [key: string]: boolean }>({});
    const configs = useRef<{ [key: string]: Partial<IReModalProps> }>({});

    const [currentView] = Object.entries(visibleView.current).find(([_, v]) => v) || [];
    const selectedView = (key: string | undefined) => (key && configs.current[key]) || {};

    useEffect(() => {
        function f() {
            const view = selectedView(currentView);
            if (view.onCancel) {
                view.onCancel();
                return true;
            }
            return false;
        }
        BackHandler.addEventListener('hardwareBackPress', f);
        return () => BackHandler.removeEventListener('hardwareBackPress', f);
    });

    return (
        <ReModalContext.Provider
            value={{
                setView: (key, view) => {
                    setViews((views) => ({ ...views, [key]: view }));
                },
                setConfig: (key, config) => {
                    configs.current = { ...configs.current, [key]: config };
                },
                setVisible: (key, visible) => {
                    if (visible) {
                        const view = selectedView(currentView);
                        if (view.onCancel && view.autoCloseWhenOpeningNextDialog) {
                            view.onCancel();
                        }
                    }
                    visibleView.current = { ...visibleView.current, [key]: visible };
                },
            }}
        >
            {children}
            {Object.entries(views).map(([key, view]) => {
                const { modalAnimationFunction, ...props } = selectedView(key);
                return (
                    <Modal
                        {...props}
                        children={view}
                        isVisible={visibleView.current[key]}
                        key={key}
                        viewStyleFnc={modalAnimationFunction || defaultModalAnimationStyle}
                    />
                );
            })}
        </ReModalContext.Provider>
    );
}

interface IReModalProps {
    children: React.ReactElement;
    isVisible: boolean;
    onCancel?: () => void;
    autoCloseWhenOpeningNextDialog?: boolean;
    modalAnimationFunction?: (
        gestureState: Animated.Adaptable<number>,
        opacity: Animated.Adaptable<number>,
        modalLayout?: { width: Animated.Adaptable<number>; height: Animated.Adaptable<number> },
    ) => any;
    onModalShow?: () => void;
    onModalHide?: () => void;
    containerStyle?: ViewStyle;
    keyboardAvoiding?: boolean;
    keyboardVerticalOffset?: number;
}

export function ReModal({
    children,
    isVisible,
    autoCloseWhenOpeningNextDialog = true,
    modalAnimationFunction = defaultModalAnimationStyle,
    ...rest
}: IReModalProps): null {
    const { setView, setVisible, setConfig } = useContext(ReModalContext);
    const { current: id } = useRef(cuid());

    if (!setView) {
        throw new Error('<ReModal/> is placed outside of a <ReModalProvider/>. Make sure <ReModalProvider/> is wrapping your root component.');
    }

    useEffect(() => {
        setVisible(id, isVisible);
        return () => setVisible(id, false);
    }, [isVisible]);

    useEffect(() => {
        setConfig(id, { autoCloseWhenOpeningNextDialog, modalAnimationFunction, ...rest });
    }, [rest, autoCloseWhenOpeningNextDialog, modalAnimationFunction]);

    useEffect(() => {
        const element = React.cloneElement(children);
        setView(id, element);
        return () => setView(id, undefined);
    }, [children]);

    return null;
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 99,
        elevation: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#00000055',
    },
});
