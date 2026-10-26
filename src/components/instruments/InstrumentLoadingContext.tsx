import { readStorage, writeStorage } from '../../utils/storage';
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';

const InstrumentLoadingContext = createContext<{
    loadInstrumentsEnabled: boolean;
    disableInstrumentLoading: () => void;
} | null>(null);

const shouldEnableInstruments = () => {
    if (navigator.deviceMemory && navigator.deviceMemory < 4) {
        console.log('Device memory too low, memory:', navigator.deviceMemory);
        return false;
    }
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
        console.log('Hardware concurrency too low, concurrency:', navigator.hardwareConcurrency);
        return false;
    }
    if (window.innerWidth < 300) {
        console.log('Window width too small, width:', window.innerWidth);
        return false;
    }
    if (!('WebGLRenderingContext' in window)) {
        console.log('WebGL not supported');
        return false;
    }

    return true;
}

interface InstrumentLoadingProviderProps {
    children: ReactNode;
}

export const InstrumentLoadingProvider: React.FC<InstrumentLoadingProviderProps> = ({ children }) => {
    const [loadInstrumentsEnabled, setLoadInstrumentsEnabled] = useState(true);

    useEffect(() => {
        const loadEnabled = readStorage(() => window.sessionStorage, 'loadInstrumentsEnabled') !== 'false'
            && shouldEnableInstruments();
        setLoadInstrumentsEnabled(loadEnabled);
        writeStorage(() => window.sessionStorage, 'loadInstrumentsEnabled', String(loadEnabled));
    }, []);

    const disableInstrumentLoading = () => {
        setLoadInstrumentsEnabled(false);
        writeStorage(() => window.sessionStorage, 'loadInstrumentsEnabled', 'false');
    };

    const providerValue = useMemo(() => ({ loadInstrumentsEnabled, disableInstrumentLoading }), [loadInstrumentsEnabled]);

    return (
        <InstrumentLoadingContext.Provider value={providerValue}>
            {children}
        </InstrumentLoadingContext.Provider>
    );
};

export const useInstrumentLoading = () => {
    const context = useContext(InstrumentLoadingContext);
    if (!context) {
        throw new Error('useInstrumentLoading must be used within a InstrumentLoadingProvider');
    }
    return context;
};
