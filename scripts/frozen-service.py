"""Frozen subprocess entry point; dispatch workers before importing the server."""

import multiprocessing

if __name__ == "__main__":
    multiprocessing.freeze_support()
    from speechify_backend.desktop import main

    main()
