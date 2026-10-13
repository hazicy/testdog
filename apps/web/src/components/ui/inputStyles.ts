import styles from './Input.module.css';
import clsx from 'clsx';

export function inputStyles(className = '') {
  return clsx(styles.input, className);
}
