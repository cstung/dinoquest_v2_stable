import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.12 },
  },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export default function Modal({ isOpen, onClose, title, children, actions }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown);

    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen, handleKeyDown]);

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal fixed inset-0 z-[9999] flex items-center justify-center p-4"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.12 }}
        >
          <motion.button
            type="button"
            aria-label="Close modal backdrop"
            className="modal-backdrop absolute inset-0 bg-black/60"
            onClick={onClose}
          />

          <motion.div
            className="modal-panel game-panel relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto overscroll-contain p-5"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              {title && (
                <h2 className="text-cream text-base font-semibold">
                  {title}
                </h2>
              )}
              <button
                onClick={onClose}
                className="p-1 border-2 border-[#0A0A0A] bg-[#FFFFFF] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFE500] flex-shrink-0"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-cream text-sm">{children}</div>

            {actions && actions.length > 0 && (
              <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-border">
                {actions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={action.onClick}
                    className={action.className || 'game-btn game-btn-blue'}
                    disabled={action.disabled}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
